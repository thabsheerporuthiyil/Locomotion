import { Link } from "react-router-dom";
import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { ArrowRight, ShieldCheck, Zap, MapPin, Star, Clock, CarFront, Users, Smartphone, CreditCard, Wallet, CheckCircle } from "lucide-react";
export default function Home() {
  const [activeTab, setActiveTab] = useState('riders');
  const { access, role, isDriver } = useAuthStore();

  const getTargetRoute = () => {
    if (!access) return "/register";
    if (role === 'admin') return "/admin/dashboard";
    if (isDriver) return "/driver/dashboard";
    return "/find-driver";
  };

  const getButtonText = () => {
    if (!access) return "Get Started Now";
    if (role === 'admin') return "Enter Admin Dashboard";
    if (isDriver) return "Go to Driver Dashboard";
    return "Find a Ride";
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col font-sans overflow-x-hidden selection:bg-indigo-100 selection:text-indigo-900">

      {/* 1. HERO SECTION */}
      <section className="relative min-h-[95vh] w-full flex items-center justify-center overflow-hidden bg-slate-950">

        {/* Animated Background Elements */}
        <div className="absolute inset-0 w-full h-full">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/30 rounded-full blur-[120px] mix-blend-screen animate-blob" />
          <div className="absolute top-[20%] right-[-5%] w-[40%] h-[40%] bg-purple-600/30 rounded-full blur-[120px] mix-blend-screen animate-blob animation-delay-2000" />
          <div className="absolute bottom-[-20%] left-[20%] w-[60%] h-[60%] bg-blue-600/20 rounded-full blur-[120px] mix-blend-screen animate-blob animation-delay-4000" />

          {/* Subtle Grid Overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]"></div>
        </div>

        <div className="max-w-7xl mx-auto px-6 w-full z-10 grid lg:grid-cols-2 gap-16 items-center pt-20">

          {/* Left Hero Text */}
          <div className="flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-semibold text-sm mb-6 backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              Next-Gen Ride Sharing is Here
            </div>

            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black text-white mb-6 leading-[1.05] tracking-tight">
              Reliable Drivers, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 animate-gradient-x">
                Whenever You Need.
              </span>
            </h1>

            <p className="text-slate-400 mb-10 text-lg sm:text-xl max-w-xl leading-relaxed font-light">
              Experience the future of mobility. Seamless bookings, verified professional drivers, and fair, transparent pricing.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <Link to={getTargetRoute()} className="w-full sm:w-auto">
                <button className="w-full group bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300 shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)] hover:shadow-[0_0_50px_-5px_rgba(79,70,229,0.7)] hover:-translate-y-0.5">
                  {getButtonText()}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
                </button>
              </Link>
              {!isDriver && (
                <Link to="/register-driver" className="w-full sm:w-auto">
                  <button className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 backdrop-blur-sm hover:border-white/20">
                    Drive with Us
                  </button>
                </Link>
              )}
            </div>
          </div>

          {/* Right Floating Elements (Glassmorphism Mockup) */}
          <div className="relative hidden lg:block h-[600px] w-full perspective-1000">
            <div className="absolute inset-0 flex items-center justify-center animate-float">

              {/* Main Glass Card */}
              <div className="relative w-80 h-96 bg-white/5 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-6 flex flex-col transform rotate-y-[-10deg] rotate-x-[5deg]">

                {/* Mock Map Header */}
                <div className="w-full h-32 rounded-2xl bg-gradient-to-br from-indigo-900/50 to-slate-800/50 border border-white/5 mb-6 overflow-hidden relative">
                  {/* Fake route line */}
                  <svg className="absolute inset-0 w-full h-full opacity-50" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d="M 10 80 Q 30 20 60 50 T 90 20" fill="none" stroke="#818cf8" strokeWidth="4" strokeDasharray="5,5" className="animate-dash" />
                    <circle cx="10" cy="80" r="4" fill="#fff" />
                    <circle cx="90" cy="20" r="5" fill="#818cf8" />
                  </svg>
                </div>

                <div className="space-y-4">
                  <div className="h-4 w-3/4 bg-white/20 rounded animate-pulse"></div>
                  <div className="h-3 w-1/2 bg-white/10 rounded animate-pulse delay-75"></div>

                  <div className="mt-auto pt-6 border-t border-white/10 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                        <CarFront className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div className="h-8 w-24 bg-white/10 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Notification Badge */}
              <div className="absolute bottom-[20%] right-[-10%] bg-indigo-600/90 backdrop-blur-md border border-indigo-400/30 text-white p-4 rounded-2xl shadow-2xl transform rotate-[5deg] animate-float-delayed flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-400/20 flex items-center justify-center">
                  <CheckCircle className="text-emerald-400 w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-indigo-200 font-semibold mb-0.5">Driver Arrived</p>
                  <p className="text-sm font-bold">Toyota Camry</p>
                </div>
              </div>

              {/* Floating Rating Badge */}
              <div className="absolute top-[10%] left-[-5%] bg-white/10 backdrop-blur-xl border border-white/20 text-white py-3 px-5 rounded-2xl shadow-xl transform rotate-[-5deg] animate-float-fast flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400 fill-current" />
                <span className="font-bold">4.98</span>
                <span className="text-slate-400 text-xs ml-1">Rating</span>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* 2. FEATURES GRID */}
      <section className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">Why Choose Locomotion?</h2>
            <p className="text-slate-500 font-medium max-w-2xl mx-auto">Engineered for reliability, safety, and ultimate convenience.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Zap className="w-6 h-6 text-yellow-500" />}
              title="Lightning Fast Matches"
              desc="Our advanced algorithm finds the closest available driver in seconds, reducing wait times by up to 40%."
              color="bg-yellow-50"
            />
            <FeatureCard
              icon={<ShieldCheck className="w-6 h-6 text-emerald-500" />}
              title="Verified Backgrounds"
              desc="Every driver undergoes strict identity and vehicle verification by our administration team before taking their first ride."
              color="bg-emerald-50"
            />
            <FeatureCard
              icon={<Star className="w-6 h-6 text-indigo-500" />}
              title="Premium Experience"
              desc="Rate your trips and favorite top-tier drivers. We ensure high platform standards through community-driven feedback."
              color="bg-indigo-50"
            />
          </div>
        </div>
      </section>

      {/* 2.5. OUR SERVICES */}
      <section className="py-24 bg-slate-50 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">Our Primary Services</h2>
            <p className="text-slate-500 font-medium max-w-2xl mx-auto">Flexible mobility solutions tailored to your unique requirements.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Driver Only Card */}
            <div className="bg-white rounded-[2rem] p-10 shadow-xl shadow-slate-200/50 border border-slate-100 relative group overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-100 hover:-translate-y-1">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-[100px] -z-10 transition-transform duration-500 group-hover:scale-110"></div>
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mb-8 text-indigo-600 shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">Driver Only</h3>
              <p className="text-slate-500 leading-relaxed font-medium mb-6">
                Have your own vehicle but need a reliable, professional driver? Hire one of our verified experts to drive your car. Perfect for long trips, events, or daily commutes where you want to relax.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3 text-sm font-bold text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><CheckCircle className="w-3 h-3" /></span>
                  Use your own vehicle
                </li>
                <li className="flex items-center gap-3 text-sm font-bold text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><CheckCircle className="w-3 h-3" /></span>
                  Verified & experienced drivers
                </li>
                <li className="flex items-center gap-3 text-sm font-bold text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><CheckCircle className="w-3 h-3" /></span>
                  Cost-effective for car owners
                </li>
              </ul>
              <Link to="/find-driver">
                <button className="text-indigo-600 font-bold flex items-center gap-2 group-hover:text-indigo-700 transition-colors">
                  Find a Driver <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
            </div>

            {/* Driver with Vehicle Card */}
            <div className="bg-slate-900 rounded-[2rem] p-10 shadow-xl shadow-slate-900/20 border border-slate-800 relative group overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
              <div className="absolute top-0 right-0 w-32 h-32 bg-slate-800 rounded-bl-[100px] -z-10 transition-transform duration-500 group-hover:scale-110"></div>
              <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-8 text-white shadow-inner group-hover:bg-white group-hover:text-slate-900 transition-colors duration-300">
                <CarFront className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-white mb-4 tracking-tight">Driver + Vehicle</h3>
              <p className="text-slate-400 leading-relaxed font-medium mb-6">
                Need the complete package? Book a top-rated driver who comes with their own verified vehicle. Choose from a range of car categories to suit your travel needs, from economy to premium.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3 text-sm font-bold text-slate-300">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0"><CheckCircle className="w-3 h-3" /></span>
                  Complete all-in-one ride solution
                </li>
                <li className="flex items-center gap-3 text-sm font-bold text-slate-300">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0"><CheckCircle className="w-3 h-3" /></span>
                  Multiple vehicle categories
                </li>
                <li className="flex items-center gap-3 text-sm font-bold text-slate-300">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0"><CheckCircle className="w-3 h-3" /></span>
                  Upfront, transparent pricing
                </li>
              </ul>
              <Link to="/find-driver">
                <button className="text-white font-bold flex items-center gap-2 group-hover:text-slate-200 transition-colors">
                  Find a Ride <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 3. HOW IT WORKS */}
      <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight">How it Works</h2>

            {/* Toggle Switch */}
            <div className="inline-flex items-center p-1 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-full">
              <button
                onClick={() => setActiveTab('riders')}
                className={`px-8 py-3 rounded-full font-bold transition-all duration-300 ${activeTab === 'riders' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                Riders
              </button>
              <button
                onClick={() => setActiveTab('drivers')}
                className={`px-8 py-3 rounded-full font-bold transition-all duration-300 ${activeTab === 'drivers' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                Drivers
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative mt-16">
            {/* Connecting Line (Desktop Only) */}
            <div className="hidden md:block absolute top-[28px] left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-slate-700 via-indigo-500 to-slate-700 z-0"></div>

            {activeTab === 'riders' ? (
              <>
                <StepCard
                  number="1"
                  icon={<Smartphone className="w-6 h-6 text-white" />}
                  title="Book"
                  desc="Choose a ride and driver"
                />
                <StepCard
                  number="2"
                  icon={<CarFront className="w-6 h-6 text-white" />}
                  title="Ride"
                  desc="Travel safe to your destination"
                />
                <StepCard
                  number="3"
                  icon={<CreditCard className="w-6 h-6 text-white" />}
                  title="Pay Directly"
                  desc="100% fare goes to the driver"
                />
              </>
            ) : (
              <>
                <StepCard
                  number="1"
                  icon={<Smartphone className="w-6 h-6 text-white" />}
                  title="Get Request"
                  desc="Get ride requests from riders"
                />
                <StepCard
                  number="2"
                  icon={<CheckCircle className="w-6 h-6 text-white" />}
                  title="Accept & Ride"
                  desc="Choose your ride and accept"
                />
                <StepCard
                  number="3"
                  icon={<Wallet className="w-6 h-6 text-white" />}
                  title="Receive Payment"
                  desc="Get payment directly from the rider"
                />
              </>
            )}
          </div>
        </div>
      </section>


      {/* 5. FOOTER */}
      <footer className="bg-white border-t border-slate-100 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-2">
              <h3 className="text-2xl font-black text-indigo-600 tracking-tighter mb-4">LOCOMOTION</h3>
              <p className="text-slate-500 font-medium max-w-sm">
                Redefining local transit with verified drivers, transparent pricing, and unparalleled reliability.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-4 uppercase tracking-wider text-sm">Company</h4>
              <ul className="space-y-3 text-slate-500 font-medium">
                <li><a href="#" className="hover:text-indigo-600 transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Press</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-4 uppercase tracking-wider text-sm">Legal</h4>
              <ul className="space-y-3 text-slate-500 font-medium">
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Driver Agreement</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-400 text-sm font-semibold tracking-widest uppercase">
              &copy; {new Date().getFullYear()} Locomotion Global Inc.
            </p>
            <div className="flex gap-6 text-slate-400">
              <span className="text-sm font-medium hover:text-indigo-600 cursor-pointer transition-colors">Support</span>
              <span className="text-sm font-medium hover:text-indigo-600 cursor-pointer transition-colors">Contact</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Sub-components for cleaner structure

function FeatureCard({ icon, title, desc, color }) {
  return (
    <div className="bg-white border border-slate-100 p-8 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
      <div className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
        {icon}
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-3 tracking-tight">{title}</h3>
      <p className="text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}

function StepCard({ number, icon, title, desc }) {
  return (
    <div className="flex flex-col items-center text-center relative z-10">
      <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center mb-6 shadow-lg shadow-indigo-900/50 outline outline-8 outline-slate-900">
        {icon}
      </div>
      <div className="absolute top-0 right-0 -mt-2 -mr-4 text-8xl font-black text-slate-800/50 -z-10 select-none">
        {number}
      </div>
      <h3 className="text-xl font-bold text-white mb-3 tracking-tight">{title}</h3>
      <p className="text-slate-400 leading-relaxed font-medium">{desc}</p>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500">
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="m8.5 8.5 7 7" />
      <path d="m15.5 8.5-7 7" />
    </svg>
  )
}