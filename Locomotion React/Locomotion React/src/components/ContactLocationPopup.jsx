import { useState } from "react";

export default function ContactLocationPopup({ open, onClose, onSubmit }) {
    const [pickup, setPickup] = useState("");
    const [destination, setDestination] = useState("");
    const [loading, setLoading] = useState(false);

    if (!open) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!pickup || !destination) {
            alert("Please enter both pickup and destination locations.");
            return;
        }

        setLoading(true);
        await onSubmit({ pickup_location: pickup, destination });
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl animate-fadeIn">
                <h2 className="text-xl font-bold mb-4">Trip Details</h2>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Pickup Location
                        </label>
                        <input
                            type="text"
                            value={pickup}
                            onChange={(e) => setPickup(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Enter pickup location"
                            required
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Destination
                        </label>
                        <input
                            type="text"
                            value={destination}
                            onChange={(e) => setDestination(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Enter destination"
                            required
                        />
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl hover:bg-gray-200 transition font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl hover:bg-indigo-700 transition font-medium disabled:bg-indigo-400"
                        >
                            {loading ? "Processing..." : "Show Contact"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
