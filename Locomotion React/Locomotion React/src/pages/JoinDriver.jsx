import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuthStore } from "../store/authStore";

export default function JoinDriver() {
  const navigate = useNavigate();
  const { fetchMe } = useAuthStore();

  const [form, setForm] = useState({
    phone_number: "",
    experience_years: "",
    service_type: "driver_only",
    profile_image: null,
    license_document: null,
    vehicle_category: "",
    vehicle_brand: "",
    vehicle_model: "",
    vehicle_registration_number: "",
    vehicle_image: null,
    rc_document: null,
    insurance_document: null,
    district: "",
    taluk: "",
    panchayath: "",
  });

  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);

  const [districts, setDistricts] = useState([]);
  const [taluks, setTaluks] = useState([]);
  const [panchayaths, setPanchayaths] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  /* =========================
     LOAD CATEGORIES ALWAYS
  ========================== */
  useEffect(() => {
    api.get("vehicles/categories/")
      .then(res => setCategories(res.data))
      .catch(() => setError("Failed to load categories"));
  }, []);

  /* =========================
     LOAD BRANDS
  ========================== */
  useEffect(() => {
    if (form.vehicle_category && form.service_type === "driver_with_vehicle") {
      api.get(`vehicles/brands/?category=${form.vehicle_category}`)
        .then(res => setBrands(res.data))
        .catch(() => setError("Failed to load brands"));
    } else {
      setBrands([]);
      setModels([]);
    }
  }, [form.vehicle_category, form.service_type]);

  /* =========================
     LOAD MODELS
  ========================== */
  useEffect(() => {
    if (form.vehicle_brand) {
      api.get(`vehicles/models/?brand=${form.vehicle_brand}`)
        .then(res => setModels(res.data))
        .catch(() => setError("Failed to load models"));
    } else {
      setModels([]);
    }
  }, [form.vehicle_brand]);

  useEffect(() => {
    api.get("location/districts/")
      .then(res => setDistricts(res.data))
      .catch(() => setError("Failed to load districts"));
  }, []);

  useEffect(() => {
    if (form.district) {
      api.get(`location/taluks/?district=${form.district}`)
        .then(res => setTaluks(res.data))
        .catch(() => setError("Failed to load taluks"));
    } else {
      setTaluks([]);
      setPanchayaths([]);
    }
  }, [form.district]);

  useEffect(() => {
    if (form.taluk) {
      api.get(`location/panchayaths/?taluk=${form.taluk}`)
        .then(res => setPanchayaths(res.data))
        .catch(() => setError("Failed to load panchayaths"));
    } else {
      setPanchayaths([]);
    }
  }, [form.taluk]);

  const handleChange = (e) => {
    const { name, value, files, type } = e.target;

    if (type === "file") {
      setForm({ ...form, [name]: files[0] });
      return;
    }

    if (name === "district") {
      setForm({
        ...form,
        district: value,
        taluk: "",
        panchayath: "",
      });
      return;
    }

    if (name === "taluk") {
      setForm({
        ...form,
        taluk: value,
        panchayath: "",
      });
      return;
    }

    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      setLoading(true);

      const formData = new FormData();
      Object.keys(form).forEach((key) => {
        if (form[key] !== null && form[key] !== "") {
          formData.append(key, form[key]);
        }
      });;

      await api.post("drivers/apply/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setSuccess(true);
      await fetchMe();
      setTimeout(() => navigate("/"), 2000);

    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.error ||
        "Failed to submit application. Please verify your inputs."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 pt-28 relative overflow-hidden">
      {/* Decorative Background Gradients */}
      <div className="absolute top-[-10%] left-[10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/10">
          <div className="w-full h-32 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border-b border-white/5 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Subtle grid in header */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px]"></div>
            <h2 className="text-3xl md:text-4xl font-black text-white text-center relative z-10 tracking-tight">
              Drive with Locomotion
            </h2>
            <p className="text-indigo-200 text-center mt-2 relative z-10 font-medium">
              Join our premium fleet today.
            </p>
          </div>

          <div className="p-8">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 mb-8 rounded-xl backdrop-blur-sm">
                <p className="text-red-400 flex items-center font-medium">
                  <span className="mr-3 text-lg">⚠️</span> {error}
                </p>
              </div>
            )}

            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 mb-8 rounded-xl backdrop-blur-sm">
                <p className="text-emerald-400 flex items-center font-medium">
                  <span className="mr-3 text-lg">✅</span> Application submitted securely. Waiting for verification.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-10">

              {/* Personal Details */}
              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-lg font-bold text-white border-b border-white/10 pb-3 mb-6 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">1</span>
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Phone Number</label>
                    <input
                      type="text"
                      name="phone_number"
                      placeholder="e.g. 9876543210"
                      onChange={handleChange}
                      className="w-full bg-slate-950/50 border border-slate-700 text-white placeholder-slate-500 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 transition-colors py-3 px-4 shadow-inner"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Experience (Years)</label>
                    <input
                      type="number"
                      name="experience_years"
                      placeholder="e.g. 5"
                      onChange={handleChange}
                      className="w-full bg-slate-950/50 border border-slate-700 text-white placeholder-slate-500 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 transition-colors py-3 px-4 shadow-inner"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Profile Image</label>
                    <input
                      type="file"
                      name="profile_image"
                      onChange={handleChange}
                      className="block w-full text-sm text-slate-400 file:mr-4 file:py-2.5 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 focus:outline-none transition-all cursor-pointer border border-slate-700 rounded-xl bg-slate-950/50"
                    />
                  </div>
                </div>
              </section>

              {/* Location Details */}
              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-lg font-bold text-white border-b border-white/10 pb-3 mb-6 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">2</span>
                  Area of Operation
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">District</label>
                    <select
                      name="district"
                      value={form.district}
                      onChange={handleChange}
                      className="w-full bg-slate-950/50 border border-slate-700 text-white rounded-xl focus:ring-emerald-500 focus:border-emerald-500 transition-colors py-3 px-4 shadow-inner appearance-none"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">Select District</option>
                      {districts.map(d => (
                        <option key={d.id} value={d.id} className="bg-slate-900">{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Taluk</label>
                    <select
                      name="taluk"
                      value={form.taluk}
                      onChange={handleChange}
                      disabled={!form.district}
                      className="w-full bg-slate-950/50 border border-slate-700 text-white rounded-xl focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors py-3 px-4 shadow-inner appearance-none"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">Select Taluk</option>
                      {taluks.map(t => (
                        <option key={t.id} value={t.id} className="bg-slate-900">{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Panchayath</label>
                    <select
                      name="panchayath"
                      value={form.panchayath}
                      onChange={handleChange}
                      disabled={!form.taluk}
                      className="w-full bg-slate-950/50 border border-slate-700 text-white rounded-xl focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors py-3 px-4 shadow-inner appearance-none"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">Select Panchayath</option>
                      {panchayaths.map(p => (
                        <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Service & Vehicle Details */}
              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-lg font-bold text-white border-b border-white/10 pb-3 mb-6 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400">3</span>
                  Platform Service & Credentials
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Service Type</label>
                    <div className="relative">
                      <select
                        name="service_type"
                        value={form.service_type}
                        onChange={handleChange}
                        className="w-full bg-slate-950/50 border border-slate-700 text-white rounded-xl focus:ring-orange-500 focus:border-orange-500 transition-colors py-3 px-4 shadow-inner appearance-none"
                      >
                        <option value="driver_only" className="bg-slate-900">Driver Only (No Vehicle)</option>
                        <option value="driver_with_vehicle" className="bg-slate-900">Driving My Own Vehicle</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Vehicle Category</label>
                    <select
                      name="vehicle_category"
                      value={form.vehicle_category}
                      onChange={handleChange}
                      className="w-full bg-slate-950/50 border border-slate-700 text-white rounded-xl focus:ring-orange-500 focus:border-orange-500 transition-colors py-3 px-4 shadow-inner appearance-none"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">Select Category</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id} className="bg-slate-900">{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  {form.service_type === "driver_with_vehicle" && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-2">Vehicle Brand</label>
                        <select
                          name="vehicle_brand"
                          value={form.vehicle_brand}
                          onChange={handleChange}
                          className="w-full bg-slate-950/50 border border-slate-700 text-white rounded-xl focus:ring-orange-500 focus:border-orange-500 transition-colors py-3 px-4 shadow-inner appearance-none"
                        >
                          <option value="" className="bg-slate-900 text-slate-400">Select Brand</option>
                          {brands.map(brand => (
                            <option key={brand.id} value={brand.id} className="bg-slate-900">{brand.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-2">Vehicle Model</label>
                        <select
                          name="vehicle_model"
                          value={form.vehicle_model}
                          onChange={handleChange}
                          className="w-full bg-slate-950/50 border border-slate-700 text-white rounded-xl focus:ring-orange-500 focus:border-orange-500 transition-colors py-3 px-4 shadow-inner appearance-none"
                        >
                          <option value="" className="bg-slate-900 text-slate-400">Select Model</option>
                          {models.map(model => (
                            <option key={model.id} value={model.id} className="bg-slate-900">{model.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-300 mb-2">Registration Number</label>
                        <input
                          type="text"
                          name="vehicle_registration_number"
                          placeholder="e.g. KL 10 AZ 1234"
                          onChange={handleChange}
                          className="w-full bg-slate-950/50 border border-slate-700 text-white placeholder-slate-500 uppercase rounded-xl focus:ring-orange-500 focus:border-orange-500 transition-colors py-3 px-4 shadow-inner font-mono tracking-wider"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-300 mb-2">Vehicle Image</label>
                        <input
                          type="file"
                          name="vehicle_image"
                          onChange={handleChange}
                          className="block w-full text-sm text-slate-400 file:mr-4 file:py-2.5 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-orange-600/20 file:text-orange-400 hover:file:bg-orange-600/30 focus:outline-none transition-all cursor-pointer border border-slate-700 rounded-xl bg-slate-950/50"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-2">RC Document</label>
                        <input
                          type="file"
                          name="rc_document"
                          onChange={handleChange}
                          className="block w-full text-sm text-slate-400 file:mr-4 file:py-2.5 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-orange-600/20 file:text-orange-400 hover:file:bg-orange-600/30 focus:outline-none transition-all cursor-pointer border border-slate-700 rounded-xl bg-slate-950/50"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-2">Insurance Document</label>
                        <input
                          type="file"
                          name="insurance_document"
                          onChange={handleChange}
                          className="block w-full text-sm text-slate-400 file:mr-4 file:py-2.5 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-orange-600/20 file:text-orange-400 hover:file:bg-orange-600/30 focus:outline-none transition-all cursor-pointer border border-slate-700 rounded-xl bg-slate-950/50"
                        />
                      </div>
                    </>
                  )}

                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Driving License (Front & Back)</label>
                    <input
                      type="file"
                      name="license_document"
                      onChange={handleChange}
                      className="block w-full text-sm text-slate-400 file:mr-4 file:py-2.5 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-orange-600/20 file:text-orange-400 hover:file:bg-orange-600/30 focus:outline-none transition-all cursor-pointer border border-slate-700 rounded-xl bg-slate-950/50"
                    />
                  </div>
                </div>
              </section>

              <div className="pt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-2xl font-black shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)] hover:shadow-[0_0_50px_-5px_rgba(79,70,229,0.7)] transition-all transform hover:-translate-y-1 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 text-lg uppercase tracking-wider"
                >
                  {loading ? "Submitting securely..." : "Submit Application"}
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}