import { Outlet } from "react-router-dom";

export function PhoneFrame() {
  return (
    <div className="h-screen md:flex md:items-center md:justify-center md:bg-gray-900 text-[14px]">
      <div className="
        w-full bg-white flex flex-col h-full
        md:w-[430px] md:h-[95vh] md:rounded-[44px]
        md:shadow-[0_0_80px_rgba(0,0,0,0.7)] md:overflow-hidden md:relative
      ">
        <Outlet />
      </div>
    </div>
  );
}
