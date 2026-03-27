import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { LayoutGrid, Car, FileText, Users, LogOut, Menu, X } from "lucide-react";
import { useAuthStore } from "../../store/authStore";

const navItems = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/drivers", label: "Driver Applications", icon: FileText },
  { to: "/admin/vehicles", label: "Vehicle Requests", icon: Car },
];

function getTitle(pathname) {
  if (pathname.startsWith("/admin/users")) return "Users";
  if (pathname.startsWith("/admin/drivers")) return "Driver Applications";
  if (pathname.startsWith("/admin/vehicles")) return "Vehicle Requests";
  return "Dashboard";
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { logout, name, email } = useAuthStore();

  const title = useMemo(() => getTitle(location.pathname), [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const Sidebar = (
    <aside className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col">
      <div className="px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold tracking-widest text-indigo-600">
              ADMIN
            </div>
            <div className="text-xl font-black text-slate-900 tracking-tight">
              LOCOMOTION
            </div>
          </div>
        </div>
      </div>

      <nav className="px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition",
                  isActive
                    ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                ].join(" ")
              }
            >
              <Icon size={18} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto px-4 py-4 border-t border-slate-200">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate">
              {name || "Admin"}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {email || ""}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 font-black flex items-center justify-center ring-1 ring-indigo-100 shrink-0">
            {(name?.[0] || "A").toUpperCase()}
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-rose-600 text-white px-4 py-3 rounded-xl font-bold transition"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <div className="hidden lg:flex">{Sidebar}</div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-[85%] max-w-xs shadow-2xl">
            {Sidebar}
          </div>
        </div>
      )}

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
                onClick={() => setMobileOpen((v) => !v)}
                aria-label="Toggle sidebar"
              >
                {mobileOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
              <h1 className="text-lg sm:text-xl font-black text-slate-900">
                {title}
              </h1>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
