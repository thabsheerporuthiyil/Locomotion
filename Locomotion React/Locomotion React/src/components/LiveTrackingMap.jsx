import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X } from 'lucide-react';

// Custom Map Car Icon
const carIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/744/744465.png', // Temporary car icon
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});

// Helper component to auto-pan map to the driver
function MapUpdater({ driverLocation }) {
    const map = useMap();
    useEffect(() => {
        if (driverLocation) {
            map.flyTo([driverLocation.latitude, driverLocation.longitude], 15, { animate: true });
        }
    }, [driverLocation, map]);
    return null;
}

export default function LiveTrackingMap({ rideId, onClose }) {
    const [driverLocation, setDriverLocation] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef(null);

    useEffect(() => {
        const WS_URL = `ws://192.168.220.46:8000/ws/location/${rideId}/`;
        wsRef.current = new WebSocket(WS_URL);

        wsRef.current.onopen = () => {
            console.log("WebSocket connected for ride:", rideId);
            setIsConnected(true);
        };

        wsRef.current.onclose = () => setIsConnected(false);
        wsRef.current.onerror = (e) => console.error("WS Error:", e);

        wsRef.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                // We only care about the driver's location
                if (data.role === 'driver' && data.latitude && data.longitude) {
                    setDriverLocation({
                        latitude: data.latitude,
                        longitude: data.longitude,
                        heading: data.heading || 0
                    });
                }
            } catch (err) {
                console.error("Parse error", err);
            }
        };

        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, [rideId]);

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-4xl h-[80vh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-black text-slate-900">Live Driver Tracking</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></span>
                            <span className="text-sm font-semibold text-slate-500">
                                {isConnected ? "Connected to Driver" : "Connecting..."}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={24} className="text-slate-500" />
                    </button>
                </div>

                {/* Map Area */}
                <div className="flex-1 bg-slate-100 relative">
                    {!driverLocation ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white/50 backdrop-blur-sm">
                            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                            <p className="font-bold text-slate-600">Waiting for driver's GPS signal...</p>
                        </div>
                    ) : (
                        <MapContainer
                            center={[driverLocation.latitude, driverLocation.longitude]}
                            zoom={15}
                            style={{ height: '100%', width: '100%', zIndex: 1 }}
                        >
                            <TileLayer
                                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                            />

                            <Marker
                                position={[driverLocation.latitude, driverLocation.longitude]}
                                icon={carIcon}
                            >
                                <Popup className="font-bold">Driver is here!</Popup>
                            </Marker>

                            <MapUpdater driverLocation={driverLocation} />
                        </MapContainer>
                    )}
                </div>
            </div>
        </div>
    );
}
