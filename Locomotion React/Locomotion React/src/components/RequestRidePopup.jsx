import { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import { useAuthStore } from "../store/authStore";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix default Leaflet icon paths
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Map Panner component
function MapPanner({ centerLat, centerLon, zoom }) {
    const map = useMap();
    useEffect(() => {
        if (centerLat && centerLon) {
            map.flyTo([centerLat, centerLon], zoom, { animate: true, duration: 1.5 });
        }
    }, [centerLat, centerLon, zoom, map]);
    return null;
}

export default function RequestRidePopup({ open, onClose, driver }) {
    const { phoneNumber: storedPhoneNumber } = useAuthStore();

    const [pickup, setPickup] = useState("");
    const [pickupCoords, setPickupCoords] = useState(null);
    const [pickupSuggestions, setPickupSuggestions] = useState([]);

    const [dropoff, setDropoff] = useState("");
    const [dropoffCoords, setDropoffCoords] = useState(null);
    const [dropoffSuggestions, setDropoffSuggestions] = useState([]);

    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [locating, setLocating] = useState(false);
    const [error, setError] = useState("");
    const [fareDetails, setFareDetails] = useState(null);
    const [phoneNumber, setPhoneNumber] = useState("");

    // Both Category selection for driver only
    const [driverOnlyAssignedCategory, setDriverOnlyAssignedCategory] = useState("4-Wheeler");

    // Vehicle Selection State
    const [selectedVehicle, setSelectedVehicle] = useState(
        driver?.all_vehicles && driver.all_vehicles.length > 0 ? driver.all_vehicles[0] : null
    );

    const [mapCenter, setMapCenter] = useState([10.8505, 76.2711]); // Kerala Default

    // Debounce refs
    const pickupTimeout = useRef(null);
    const dropoffTimeout = useRef(null);

    // Close dropdowns gently
    const [showPickupOptions, setShowPickupOptions] = useState(false);
    const [showDropoffOptions, setShowDropoffOptions] = useState(false);

    // Reset Fare if Vehicle changes
    useEffect(() => {
        setFareDetails(null);
    }, [selectedVehicle, driverOnlyAssignedCategory]);

    if (!open) return null;

    // Helper: Photon Search for Autocomplete Suggestions
    const searchPlaces = async (query) => {
        if (!query || query.length < 3) return [];
        try {
            // Viewbox bounds focusing roughly on India/Kerala to improve relevance can be added if needed
            const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
            const data = await res.json();
            return data.features || [];
        } catch (err) {
            console.error("Search API error:", err);
            return [];
        }
    };

    // Helper: Build precise string from Photon feature
    const formatAddress = (feature) => {
        const props = feature.properties;
        const parts = [];
        if (props.name) parts.push(props.name);
        if (props.street) parts.push(props.street);
        if (props.locality || props.city || props.town || props.village) {
            parts.push(props.locality || props.city || props.town || props.village);
        }
        if (props.state) parts.push(props.state);
        return parts.join(", ") || "Unknown Location";
    };

    // Reverse Geocode using Nominatim for Current Location button
    const reverseGeocode = async (lat, lon) => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
            const data = await res.json();
            if (data && data.address) {
                const addr = data.address;
                const parts = [];
                if (addr.road) parts.push(addr.road);
                if (addr.neighbourhood || addr.suburb || addr.village) {
                    parts.push(addr.neighbourhood || addr.suburb || addr.village);
                }
                if (addr.city || addr.town || addr.county) {
                    parts.push(addr.city || addr.town || addr.county);
                }
                if (addr.state) parts.push(addr.state);
                return parts.length > 0 ? parts.join(", ") : data.display_name || "Current Location";
            }
            return "Current Location";
        } catch (err) {
            console.error("Reverse geocoding error:", err);
            return "Current Location";
        }
    };

    // Current Location Geolocation
    const handleUseCurrentLocation = () => {
        setLocating(true);
        setError("");
        setShowPickupOptions(false);
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    setPickupCoords({ lat, lon });
                    setMapCenter([lat, lon]);

                    const addressName = await reverseGeocode(lat, lon);
                    setPickup(addressName);
                    setLocating(false);
                },
                (err) => {
                    console.error(err);
                    setError("Failed to get current location. Please allow location access in your browser.");
                    setLocating(false);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            setError("Geolocation is not supported by your browser.");
            setLocating(false);
        }
    };

    // Manual Input Handlers
    const handlePickupChange = (e) => {
        const value = e.target.value;
        setPickup(value);
        setPickupCoords(null);
        setFareDetails(null);
        setShowPickupOptions(true);

        if (pickupTimeout.current) clearTimeout(pickupTimeout.current);
        pickupTimeout.current = setTimeout(async () => {
            const results = await searchPlaces(value);
            setPickupSuggestions(results);
        }, 500); // 500ms debounce
    };

    const handlePickupSelect = (feature) => {
        const [lon, lat] = feature.geometry.coordinates;
        setPickup(formatAddress(feature));
        setPickupCoords({ lat, lon });
        setMapCenter([lat, lon]);
        setShowPickupOptions(false);
    };

    const handleDropoffChange = (e) => {
        const value = e.target.value;
        setDropoff(value);
        setDropoffCoords(null);
        setFareDetails(null);
        setShowDropoffOptions(true);

        if (dropoffTimeout.current) clearTimeout(dropoffTimeout.current);
        dropoffTimeout.current = setTimeout(async () => {
            const results = await searchPlaces(value);
            setDropoffSuggestions(results);
        }, 500);
    };

    const handleDropoffSelect = (feature) => {
        const [lon, lat] = feature.geometry.coordinates;
        setDropoff(formatAddress(feature));
        setDropoffCoords({ lat, lon });
        setMapCenter([lat, lon]);
        setShowDropoffOptions(false);
    };

    const handleCalculateFare = async () => {
        setLoading(true);
        setError("");
        setFareDetails(null);

        try {
            const requestPayload = {
                pickup_lat: pickupCoords?.lat || null,
                pickup_lon: pickupCoords?.lon || null,
                dropoff_lat: dropoffCoords?.lat || null,
                dropoff_lon: dropoffCoords?.lon || null
            };

            // If it's a driver with vehicle, send the selected vehicle's category.
            // If it's a driver only, they might have a single category assigned from their application.
            if (driver.service_type === 'driver_with_vehicle' && selectedVehicle) {
                requestPayload.vehicle_category = selectedVehicle.category;
            } else if (driver.service_type === 'driver_only' && driver.vehicle_category_name && driver.vehicle_category_name.length > 0) {
                if (driver.vehicle_category_name[0].toLowerCase() === 'both') {
                    requestPayload.vehicle_category = driverOnlyAssignedCategory; // Uses the selected 2 or 4 wheeler
                } else {
                    requestPayload.vehicle_category = driver.vehicle_category_name[0];
                }
            }

            const response = await api.post("bookings/calculate-fare/", requestPayload);

            setFareDetails(response.data);

            // Adjust map view to approximate center between two points when calculated
            setMapCenter([
                (pickupCoords.lat + dropoffCoords.lat) / 2,
                (pickupCoords.lon + dropoffCoords.lon) / 2
            ]);

        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || err.message || "Failed to calculate fare.");
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmRide = async () => {
        setSubmitting(true);
        setError("");

        try {
            const payload = {
                driver: driver.id,
                source_location: pickup,
                source_lat: pickupCoords?.lat || null,
                source_lng: pickupCoords?.lon || null,
                destination_location: dropoff,
                destination_lat: dropoffCoords?.lat || null,
                destination_lng: dropoffCoords?.lon || null,
                distance_km: fareDetails?.distance_km || null,
                estimated_fare: fareDetails?.estimated_fare || null,
            };

            if (!storedPhoneNumber) {
                payload.rider_phone_number = phoneNumber;
            }

            if (driver.service_type === 'driver_with_vehicle' && selectedVehicle) {
                payload.vehicle_details = `${selectedVehicle.model} (${selectedVehicle.registration})`;
            } else if (driver.service_type === 'driver_only' && driver.vehicle_category_name && driver.vehicle_category_name.length > 0) {
                if (driver.vehicle_category_name[0].toLowerCase() === 'both') {
                    payload.vehicle_details = `Driver Only (${driverOnlyAssignedCategory})`;
                } else {
                    payload.vehicle_details = `Driver Only (${driver.vehicle_category_name[0]})`;
                }
            }

            await api.post("bookings/request/", payload);
            alert("Ride Request Sent Successfully!");
            onClose();
        } catch (err) {
            console.error("Booking failed:", err);
            setError(err.response?.data?.error || "Failed to send ride request.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            {/* Modal Container: Fixed max height, overflow hidden so children handle scrolling */}
            <div className="bg-slate-900 rounded-[2rem] border border-white/10 w-full max-w-5xl shadow-2xl relative animate-fadeIn transition-all flex flex-col md:flex-row h-[90vh] overflow-hidden overflow-y-auto md:overflow-hidden">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white hover:bg-white/10 transition z-50 bg-slate-800/80 backdrop-blur rounded-full p-2 shadow-sm border border-white/5"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Left Side: Map View (Fixed on Desktop) */}
                <div className="w-full md:w-1/2 h-[35vh] md:h-full relative z-0 border-b md:border-b-0 md:border-r border-slate-700/50 pointer-events-auto">
                    <MapContainer center={mapCenter} zoom={13} style={{ height: "100%", width: "100%", filter: 'invert(90%) hue-rotate(180deg) brightness(85%) contrast(85%)' }}>
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapPanner centerLat={mapCenter[0]} centerLon={mapCenter[1]} zoom={13} />

                        {pickupCoords && (
                            <Marker position={[pickupCoords.lat, pickupCoords.lon]}>
                                <Popup><b>Pickup:</b> {pickup}</Popup>
                            </Marker>
                        )}
                        {dropoffCoords && (
                            <Marker position={[dropoffCoords.lat, dropoffCoords.lon]}>
                                <Popup><b>Dropoff:</b> {dropoff}</Popup>
                            </Marker>
                        )}
                    </MapContainer>
                </div>

                {/* Right Side: Scrollable Form */}
                <div className="w-full md:w-1/2 h-full overflow-y-auto bg-slate-900 flex flex-col p-6 md:p-8 2xl:p-10 custom-scrollbar relative z-10">
                    <div className="pb-4">
                        <h2 className="text-2xl font-black text-white tracking-tight">Request Ride</h2>
                        <p className="text-sm text-slate-400 mt-1">Fill out your trip details below.</p>
                    </div>

                    {driver && (
                        <div className="mb-6 bg-slate-950/50 rounded-2xl p-4 border border-slate-700/50 flex flex-col gap-4 shadow-inner">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-indigo-400 font-bold overflow-hidden border border-slate-600 shadow-inner shrink-0">
                                    {driver.profile_image ? (
                                        <img src={driver.profile_image} className="w-full h-full object-cover" alt={driver.name} />
                                    ) : (
                                        driver.name.charAt(0)
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">Your Driver</p>
                                    <p className="font-bold text-white text-lg leading-tight">{driver.name}</p>
                                </div>
                            </div>

                            {/* Vehicle Selection dropdown if driver has vehicles */}
                            {driver.service_type === 'driver_with_vehicle' && driver.all_vehicles && driver.all_vehicles.length > 0 && (
                                <div className="pt-3 border-t border-slate-800">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Select Vehicle Preference</label>
                                    <div className="relative">
                                        <select
                                            className="w-full appearance-none bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-10 py-3 text-sm font-medium text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm hover:border-slate-500 transition-colors cursor-pointer"
                                            value={selectedVehicle ? JSON.stringify(selectedVehicle) : ''}
                                            onChange={(e) => setSelectedVehicle(JSON.parse(e.target.value))}
                                        >
                                            {driver.all_vehicles.map((v, idx) => (
                                                <option key={idx} value={JSON.stringify(v)} className="bg-slate-900 text-slate-300">
                                                    {v.model} - {v.registration}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="mb-4 p-3 bg-red-500/10 text-red-400 text-sm rounded-lg border border-red-500/20 backdrop-blur-sm font-medium">
                            {error}
                        </div>
                    )}

                    <div className="flex-1 space-y-6 pb-6">
                        {/* Route Block */}
                        <div className="bg-slate-950/50 rounded-2xl shadow-inner relative group border border-slate-700/50 hover:border-indigo-500/50 transition-colors duration-300">

                            {/* Visual Timeline Bar */}
                            <div className="absolute left-6 top-8 bottom-8 w-px bg-slate-700 flex flex-col justify-between items-center z-10 pointer-events-none">
                                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                                <div className="w-2.5 h-2.5 rounded-sm bg-purple-500 shrink-0 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                            </div>

                            <div className="flex flex-col relative z-20">
                                {/* Pickup Input Group */}
                                <div className="relative pl-12 pr-4 py-4">
                                    <div className="flex gap-2">
                                        <div className="flex-1 relative">
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pickup Location</label>
                                            <input
                                                type="text"
                                                value={pickup}
                                                onChange={handlePickupChange}
                                                onFocus={() => setShowPickupOptions(true)}
                                                className="w-full bg-transparent text-sm font-medium text-white focus:outline-none placeholder-slate-600 truncate"
                                                placeholder="Where from?"
                                            />
                                            {/* Pickup Autocomplete Dropdown */}
                                            {showPickupOptions && pickupSuggestions.length > 0 && (
                                                <ul className="absolute z-50 w-[calc(100%+3rem)] -left-12 mt-4 bg-slate-800 border border-slate-700 shadow-2xl max-h-56 overflow-y-auto rounded-2xl divide-y divide-slate-700 ring-1 ring-white/5">
                                                    {pickupSuggestions.map((req, i) => (
                                                        <li
                                                            key={i}
                                                            onClick={() => handlePickupSelect(req)}
                                                            className="px-5 py-3.5 hover:bg-slate-700/50 cursor-pointer transition select-none group/item"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="bg-slate-900 border border-slate-700 p-2 rounded-full text-slate-500 group-hover/item:text-indigo-400 group-hover/item:border-indigo-500/30 transition-colors">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="font-bold text-slate-200 block truncate text-sm">{req.properties.name}</span>
                                                                    <span className="text-[11px] text-slate-500 truncate block mt-0.5">{formatAddress(req)}</span>
                                                                </div>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleUseCurrentLocation}
                                            disabled={locating}
                                            className="p-2.5 bg-slate-900 border border-slate-700 text-indigo-400 rounded-xl hover:bg-slate-800 hover:text-indigo-300 transition-colors shadow-sm self-center shrink-0 disabled:opacity-50"
                                            title="Use my current location"
                                        >
                                            {locating ? (
                                                <span className="animate-spin text-lg block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full"></span>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className="h-px bg-slate-800 ml-12"></div>

                                {/* Dropoff Input Group */}
                                <div className="relative pl-12 pr-4 py-4">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Dropoff Location</label>
                                    <input
                                        type="text"
                                        value={dropoff}
                                        onChange={handleDropoffChange}
                                        onFocus={() => setShowDropoffOptions(true)}
                                        className="w-full bg-transparent text-sm font-medium text-white focus:outline-none placeholder-slate-600 truncate"
                                        placeholder="Where to?"
                                    />
                                    {/* Dropoff Autocomplete Dropdown */}
                                    {showDropoffOptions && dropoffSuggestions.length > 0 && (
                                        <ul className="absolute z-50 w-[calc(100%+3rem)] -left-12 mt-4 bg-slate-800 border border-slate-700 shadow-2xl max-h-56 overflow-y-auto rounded-2xl divide-y divide-slate-700 ring-1 ring-white/5">
                                            {dropoffSuggestions.map((req, i) => (
                                                <li
                                                    key={i}
                                                    onClick={() => handleDropoffSelect(req)}
                                                    className="px-5 py-3.5 hover:bg-slate-700/50 cursor-pointer transition select-none group/item"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="bg-slate-900 border border-slate-700 p-2 rounded-full text-slate-500 group-hover/item:text-purple-400 group-hover/item:border-purple-500/30 transition-colors">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <span className="font-bold text-slate-200 block truncate text-sm">{req.properties.name}</span>
                                                            <span className="text-[11px] text-slate-500 truncate block mt-0.5">{formatAddress(req)}</span>
                                                        </div>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Calculate Button */}
                        {!fareDetails && (
                            <button
                                type="button"
                                onClick={handleCalculateFare}
                                disabled={loading || !pickupCoords || !dropoffCoords}
                                className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white pt-4 pb-3.5 rounded-2xl hover:shadow-[0_0_20px_-5px_rgba(79,70,229,0.5)] transition-all font-bold disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 shadow-md active:scale-[0.98] flex justify-center items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div>
                                        Calculating...
                                    </>
                                ) : "Calculate Pricing"}
                            </button>
                        )}

                        {/* Step 2: Confirmation UI (Requires fareDetails) */}
                        {fareDetails && (
                            <div className="space-y-6 animate-fadeIn mt-2">
                                {/* Fare Details Display (Receipt View) */}
                                <div className="bg-slate-950/50 rounded-2xl border border-slate-700 p-6 shadow-inner">
                                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 pb-3 border-b border-slate-800">
                                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                        Trip Estimate
                                    </h3>

                                    <div className="grid grid-cols-2 gap-4 mb-5">
                                        <div className="bg-slate-900 border border-slate-700/50 p-3.5 rounded-xl shadow-sm text-center">
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Distance</p>
                                            <p className="text-lg font-black text-white">{fareDetails.distance_km} <span className="text-sm font-semibold text-slate-500">km</span></p>
                                        </div>
                                        <div className="bg-slate-900 border border-slate-700/50 p-3.5 rounded-xl shadow-sm text-center">
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Duration</p>
                                            <p className="text-lg font-black text-white">{fareDetails.duration_min} <span className="text-sm font-semibold text-slate-500">min</span></p>
                                        </div>
                                    </div>

                                    <div className="space-y-3 mb-5 px-1 font-medium">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-slate-400">Ride Base Fare</span>
                                            <span className="text-slate-200">₹{fareDetails.ride_fare}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-slate-400 flex items-center gap-1.5">
                                                Platform Fee
                                                <div className="group relative">
                                                    <svg className="w-3.5 h-3.5 text-slate-600 hover:text-slate-400 cursor-help" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                                                    <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-800 text-slate-300 text-[10px] px-2.5 py-1.5 rounded-lg text-center shadow-xl opacity-0 group-hover:opacity-100 transition-opacity border border-slate-700">
                                                        Tiered fee based on ride distance.
                                                    </div>
                                                </div>
                                            </span>
                                            <span className="text-slate-200">₹{fareDetails.service_charge}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-end justify-between border-t border-slate-800 pt-5 mt-2">
                                        <span className="text-indigo-400 font-bold text-sm uppercase tracking-wider">Total Est.</span>
                                        <span className="text-4xl font-black text-white tracking-tight leading-none drop-shadow-[0_0_15px_rgba(79,70,229,0.3)]">₹{fareDetails.estimated_fare}</span>
                                    </div>
                                </div>

                                {/* Phone Number Input (Conditional) */}
                                {!storedPhoneNumber && (
                                    <div className="bg-slate-950/50 p-4 rounded-xl border border-rose-500/30 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]"></div>
                                        <label className="block text-xs font-bold text-white uppercase tracking-widest mb-2 pl-2">Rider Mobile Number</label>
                                        <input
                                            type="tel"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            placeholder="e.g. +91 9876543210"
                                            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 text-white placeholder-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-sm ml-2"
                                            required
                                        />
                                        <p className="text-[10px] text-slate-400 mt-2 ml-2 font-medium">Required by drivers for pickup coordination.</p>
                                    </div>
                                )}

                                {/* Both Option Selection for Driver Only UI */}
                                {driver.service_type === 'driver_only' &&
                                    driver.vehicle_category_name &&
                                    driver.vehicle_category_name.length > 0 &&
                                    driver.vehicle_category_name[0].toLowerCase() === 'both' && (
                                        <div className="p-4 bg-slate-950/50 border border-slate-700 rounded-xl">
                                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Vehicle Requirement</p>
                                            <div className="flex gap-3">
                                                <label className={`flex-1 flex flex-col items-center justify-center py-4 rounded-xl border border-transparent cursor-pointer transition-all ${driverOnlyAssignedCategory === '2-Wheeler' ? 'bg-indigo-600/20 border-indigo-500/50 shadow-[0_0_15px_rgba(79,70,229,0.2)] transform scale-[1.02]' : 'bg-slate-900 hover:bg-slate-800'}`}>
                                                    <input
                                                        type="radio"
                                                        name="assignedCategory"
                                                        value="2-Wheeler"
                                                        className="hidden"
                                                        checked={driverOnlyAssignedCategory === '2-Wheeler'}
                                                        onChange={() => setDriverOnlyAssignedCategory('2-Wheeler')}
                                                    />
                                                    <svg className={`w-6 h-6 mb-2 ${driverOnlyAssignedCategory === '2-Wheeler' ? 'text-indigo-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                                                    <span className={`text-[11px] font-black uppercase tracking-wider ${driverOnlyAssignedCategory === '2-Wheeler' ? 'text-indigo-300' : 'text-slate-500'}`}>2-Wheeler</span>
                                                </label>

                                                <label className={`flex-1 flex flex-col items-center justify-center py-4 rounded-xl border border-transparent cursor-pointer transition-all ${driverOnlyAssignedCategory === '4-Wheeler' ? 'bg-indigo-600/20 border-indigo-500/50 shadow-[0_0_15px_rgba(79,70,229,0.2)] transform scale-[1.02]' : 'bg-slate-900 hover:bg-slate-800'}`}>
                                                    <input
                                                        type="radio"
                                                        name="assignedCategory"
                                                        value="4-Wheeler"
                                                        className="hidden"
                                                        checked={driverOnlyAssignedCategory === '4-Wheeler'}
                                                        onChange={() => setDriverOnlyAssignedCategory('4-Wheeler')}
                                                    />
                                                    <svg className={`w-6 h-6 mb-2 ${driverOnlyAssignedCategory === '4-Wheeler' ? 'text-indigo-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                                                    <span className={`text-[11px] font-black uppercase tracking-wider ${driverOnlyAssignedCategory === '4-Wheeler' ? 'text-indigo-300' : 'text-slate-500'}`}>4-Wheeler</span>
                                                </label>
                                            </div>
                                        </div>
                                    )}

                                <button
                                    type="button"
                                    onClick={handleConfirmRide}
                                    disabled={submitting}
                                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white pt-4 pb-3.5 rounded-2xl hover:shadow-[0_0_30px_-5px_rgba(79,70,229,0.6)] active:scale-[0.98] transition-all font-bold shadow-lg flex items-center justify-center uppercase tracking-wider text-sm border border-indigo-500/50"
                                >
                                    {submitting ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-indigo-200 border-t-white rounded-full animate-spin mr-2"></div>
                                            Transmitting...
                                        </>
                                    ) : "Confirm Ride Request"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
