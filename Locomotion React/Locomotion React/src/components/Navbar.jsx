import { Link } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { Menu, X, Rocket } from "lucide-react";
import NotificationBell from "./NotificationBell";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [avatarErrored, setAvatarErrored] = useState(false);
  const profileRef = useRef(null);

  const {
    access,
    logout,
    name,
    email,
    profileImageUrl,
    role,
    isDriver,
    driverApplication,
  } = useAuthStore();

  const applicationStatus = driverApplication?.status;
  const firstLetter = name ? name.charAt(0).toUpperCase() : "U";

  useEffect(() => {
    setAvatarErrored(false);
  }, [profileImageUrl]);

  // Handle scroll effect for slightly more prominent shadow
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle click outside profile dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileRef]);

  const handleLogout = () => {
    logout();
    setIsProfileOpen(false);
    setIsOpen(false);
  };

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${scrolled
          ? "bg-white/90 backdrop-blur-lg border-b border-slate-200 shadow-sm"
          : "bg-white border-b border-transparent"
        }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center h-20">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              LOCOMOTION
            </span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-2">
            {access ? (
              <>
                <NavLink to="/">Home</NavLink>

                {role !== "admin" && !isDriver && !driverApplication && (
                  <NavLink to="/join-driver">Drive with Us</NavLink>
                )}

                <NavLink to="/find-driver">Book Ride</NavLink>

                <NavLink to="/my-rides">My Rides</NavLink>

                {applicationStatus === "pending" && (
                  <span className="text-yellow-600 font-medium px-4 py-2 bg-yellow-50 rounded-full text-sm border border-yellow-200">
                    Application Pending
                  </span>
                )}

                {applicationStatus === "rejected" && (
                  <Link to="/join-driver" className="text-red-600 hover:text-red-700 px-3 py-2 font-medium transition-colors">
                    Reapply to Drive
                  </Link>
                )}

                {isDriver && (
                  <Link to="/driver/dashboard" className="text-emerald-600 hover:text-emerald-700 px-3 py-2 font-bold flex items-center gap-2 transition-colors">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Driver Dashboard
                  </Link>
                )}

                {role === "admin" && (
                  <NavLink to="/admin/dashboard">Admin Panel</NavLink>
                )}

                <NotificationBell />

                {/* Profile Icon with Dropdown */}
                <div className="relative ml-4" ref={profileRef}>
                  <button
                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                    className="w-11 h-11 rounded-full bg-indigo-50 border-2 border-indigo-100 text-indigo-600 font-bold flex items-center justify-center hover:bg-indigo-100 hover:border-indigo-200 transition-all shadow-sm overflow-hidden"
                  >
                    {profileImageUrl && !avatarErrored ? (
                      <img
                        src={profileImageUrl}
                        alt={name || "Profile"}
                        className="w-full h-full object-cover"
                        onError={() => setAvatarErrored(true)}
                      />
                    ) : (
                      firstLetter
                    )}
                  </button>

                  {/* Profile Dropdown */}
                  {isProfileOpen && (
                    <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 transform origin-top-right transition-all">
                      <div className="px-5 py-4 border-b border-slate-100">
                        <p className="font-bold text-slate-900 truncate">{name || "User"}</p>
                        <p className="text-sm text-slate-500 truncate">{email || "user@example.com"}</p>
                      </div>
                      <Link
                        to="/profile"
                        className="block px-5 py-3 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        Profile Settings
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-5 py-3 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors font-medium"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-4 ml-4">
                <Link to="/login" className="text-slate-600 hover:text-indigo-600 font-medium px-4 py-2 transition-colors">
                  Sign In
                </Link>
                <Link to="/register">
                  <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-full font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5">
                    Start Riding
                  </button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center gap-2">
            {access ? <NotificationBell /> : null}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
            >
              {isOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 shadow-xl absolute w-full left-0">
          <div className="px-4 py-4 space-y-1">
            {access ? (
              <>
                {/* Mobile Profile Section */}
                <div className="py-4 border-b border-slate-100 mb-2">
                  <div className="flex items-center space-x-4 px-2">
                    <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold flex items-center justify-center overflow-hidden">
                      {profileImageUrl && !avatarErrored ? (
                        <img
                          src={profileImageUrl}
                          alt={name || "Profile"}
                          className="w-full h-full object-cover"
                          onError={() => setAvatarErrored(true)}
                        />
                      ) : (
                        firstLetter
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{name || "User"}</p>
                      <p className="text-sm text-slate-500">{email || "user@example.com"}</p>
                    </div>
                  </div>
                </div>

                <MobileNavLink to="/" onClick={() => setIsOpen(false)}>Home</MobileNavLink>

                {role !== "admin" && !isDriver && !driverApplication && (
                  <MobileNavLink to="/join-driver" onClick={() => setIsOpen(false)}>Drive with Us</MobileNavLink>
                )}

                <MobileNavLink to="/find-driver" onClick={() => setIsOpen(false)}>Book Ride</MobileNavLink>

                <MobileNavLink to="/my-rides" onClick={() => setIsOpen(false)}>My Rides</MobileNavLink>

                {applicationStatus === "pending" && (
                  <div className="py-3 px-4 text-yellow-600 font-medium">Application Pending</div>
                )}

                {applicationStatus === "rejected" && (
                  <Link
                    to="/join-driver"
                    className="block py-3 px-4 text-red-600 font-medium bg-red-50 rounded-xl mt-1"
                    onClick={() => setIsOpen(false)}
                  >
                    Reapply to Drive
                  </Link>
                )}

                {isDriver && (
                  <Link
                    to="/driver/dashboard"
                    className="flex items-center gap-2 py-3 px-4 text-emerald-600 font-bold bg-emerald-50 rounded-xl mt-1"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Driver Dashboard
                  </Link>
                )}

                {role === "admin" && (
                  <MobileNavLink to="/admin/dashboard" onClick={() => setIsOpen(false)}>Admin Panel</MobileNavLink>
                )}

                <MobileNavLink to="/profile" onClick={() => setIsOpen(false)}>Profile Settings</MobileNavLink>

                <button
                  onClick={handleLogout}
                  className="block w-full text-left py-3 px-4 text-red-600 font-medium hover:bg-slate-50 rounded-xl transition-colors mt-2"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <div className="space-y-3 pb-4">
                <Link
                  to="/login"
                  className="block py-3 px-4 text-slate-600 font-medium hover:bg-slate-50 rounded-xl transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="block px-4"
                  onClick={() => setIsOpen(false)}
                >
                  <button className="w-full bg-indigo-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md">
                    Get Started
                  </button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

// Subcomponent for cleaner desktop links
function NavLink({ to, children }) {
  return (
    <Link
      to={to}
      className="text-slate-600 hover:text-indigo-600 px-4 py-2 rounded-full hover:bg-slate-50 transition-all font-medium text-sm"
    >
      {children}
    </Link>
  );
}

// Subcomponent for cleaner mobile links
function MobileNavLink({ to, children, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block py-3 px-4 text-slate-600 font-medium hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-colors"
    >
      {children}
    </Link>
  );
}
