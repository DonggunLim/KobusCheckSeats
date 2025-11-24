import { KakaoSigninButton } from "@/features/signin-kakao/ui/KakaoSigninButton";

export function Header() {
  return (
    <header className="w-full shadow-sm bg-green-primary">
      <div className="max-w-7xl mx-auto w-full px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-wide">
          KobusCheckSeats
        </h1>
        <KakaoSigninButton />
      </div>
    </header>
  );
}
