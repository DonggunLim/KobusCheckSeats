import { NextRequest, NextResponse } from "next/server";
import {
  getCheckSeatsQueue,
  type CheckSeatsJobData,
} from "@/shared/lib/queue/queue";
import prisma from "@/shared/lib/prisma";
import { getKSTNow } from "@/shared/lib/date";
import { auth } from "@/shared/lib/auth";
import { JOB_CANCEL_REASON_KEY } from "@/shared/constants/job";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    const body = await request.json();

    // 요청 데이터 검증
    const {
      departureCd,
      arrivalCd,
      targetMonth,
      targetDate,
      targetTimes,
      scheduleId,
    } = body;

    if (
      !departureCd ||
      !arrivalCd ||
      !targetMonth ||
      !targetDate ||
      !targetTimes
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: departureCd, arrivalCd, targetMonth, targetDate, targetTimes",
        },
        { status: 400 }
      );
    }

    // targetTimes가 배열인지 확인
    if (!Array.isArray(targetTimes) || targetTimes.length === 0) {
      return NextResponse.json(
        { error: "targetTimes must be a non-empty array" },
        { status: 400 }
      );
    }

    // 목표 시간까지 필요한 attempts 계산
    const nowKST = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
    );
    const year = nowKST.getFullYear();
    const month = parseInt(targetMonth.replace("월", ""));
    const day = parseInt(targetDate);

    // 가장 늦은 시간 찾기
    const lastTime = targetTimes.sort().reverse()[0];
    const [hour, minute] = lastTime.split(":").map(Number);

    // 목표 날짜+시간 생성
    const targetDateTime = new Date(year, month - 1, day, hour, minute);

    // 남은 시간 계산 (밀리초)
    const remainingTime = targetDateTime.getTime() - nowKST.getTime();

    // 3분 간격으로 몇 번 시도할 수 있는지 계산
    const retryInterval = 3 * 60 * 1000; // 3분
    const maxAttempts = Math.max(1, Math.ceil(remainingTime / retryInterval));

    // 큐에 Job 추가
    const jobData: CheckSeatsJobData = {
      departureCd,
      arrivalCd,
      targetMonth,
      targetDate,
      targetTimes,
      scheduleId,
      userId,
    };

    const queue = getCheckSeatsQueue();
    const job = await queue.add("check-seats-job", jobData, {
      priority: body.priority || 1,
      delay: body.delay || 0,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: maxAttempts,
      backoff: {
        type: "fixed",
        delay: retryInterval, // 3분 고정 대기
      },
    });

    // 터미널 이름 조회 (코드 → 이름)
    const terminals = await prisma.terminal.findMany({
      where: {
        terminalCd: { in: [departureCd, arrivalCd] },
      },
      select: {
        terminalCd: true,
        terminalNm: true,
      },
    });

    const terminalMap = new Map(
      terminals.map((t) => [t.terminalCd, t.terminalNm])
    );

    const departureName = terminalMap.get(departureCd) || departureCd;
    const arrivalName = terminalMap.get(arrivalCd) || arrivalCd;

    // DB에 잡 히스토리 저장
    let createdJob;
    try {
      createdJob = await prisma.jobHistory.create({
        data: {
          jobId: job.id as string,
          departure: departureName,
          arrival: arrivalName,
          targetMonth,
          targetDate,
          targetTimes: JSON.stringify(targetTimes),
          status: "waiting",
          retryCount: 0,
          userId,
          createdAt: getKSTNow(),
          updatedAt: getKSTNow(),
        },
      });

      console.log("[Job Created] Job saved to DB:", {
        id: createdJob.id,
        jobId: createdJob.jobId,
        departure: createdJob.departure,
        arrival: createdJob.arrival,
      });
    } catch (dbError) {
      console.error("Failed to save job history to DB:", dbError);
      // DB 저장 실패해도 큐에는 추가됐으므로 계속 진행
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Job added to queue successfully",
    });
  } catch (error) {
    console.error("Error adding job to queue:", error);
    return NextResponse.json(
      { error: "Failed to add job to queue" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing jobId parameter" },
        { status: 400 }
      );
    }

    const queue = getCheckSeatsQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const state = await job.getState();
    const progress = job.progress;

    return NextResponse.json({
      jobId: job.id,
      state,
      progress,
      data: job.data,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    });
  } catch (error) {
    console.error("Error fetching job status:", error);
    return NextResponse.json(
      { error: "Failed to fetch job status" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing jobId parameter" },
        { status: 400 }
      );
    }

    await prisma.jobHistory.update({
      where: { jobId },
      data: {
        status: "cancelled",
        reason: JOB_CANCEL_REASON_KEY.USER_CANCELLED,
        updatedAt: getKSTNow(),
        completedAt: getKSTNow(),
      },
    });

    await tryRemoveJobFromQueue(jobId);

    return NextResponse.json({
      success: true,
      message: "Job cancelled successfully",
      jobId,
    });
  } catch (error) {
    console.error("Error cancelling job:", error);
    return NextResponse.json(
      { error: "Failed to cancel job" },
      { status: 500 }
    );
  }
}

// Job 큐에서 제거 시도
async function tryRemoveJobFromQueue(jobId: string) {
  try {
    const queue = getCheckSeatsQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
      console.log(`[Job Cancel] Job ${jobId} not found in queue`);
      return false;
    }

    const state = await job.getState();

    // active 상태가 아닌 경우에만 제거
    if (state !== "active") {
      await job.remove();
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.warn(`[Job Cancel] Could not remove job ${jobId}:`, error);
    return false;
  }
}
