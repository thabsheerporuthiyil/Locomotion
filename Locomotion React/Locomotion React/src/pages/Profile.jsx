import { useAuthStore } from "../store/authStore";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

export default function Profile() {
    const { name, role, is2FAEnabled, fetchMe, driverApplication } = useAuthStore();
    const navigate = useNavigate();

    const disable2FA = async () => {
        try {
            await api.post("accounts/2fa/disable/");
            await fetchMe();
            alert("2FA Disabled Successfully");
        } catch (err) {
            console.error(err);
            alert("Failed to disable 2FA");
        }
    };


    return (
        <div className="min-h-screen bg-slate-50 pt-32 px-6">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Profile Info */}
                <div className="bg-white p-8 rounded-3xl shadow">
                    <h1 className="text-2xl font-bold mb-6">Profile</h1>

                    <div className="space-y-3">
                        <p><strong>Name:</strong> {name}</p>
                        <p><strong>Role:</strong> {role}</p>
                    </div>
                </div>

                {driverApplication && (
                    <div className="bg-white p-8 rounded-3xl shadow">
                        <h2 className="text-xl font-bold mb-6">Driver Application</h2>

                        <p className="capitalize mb-4">
                            <strong>Status:</strong> {driverApplication.status}
                        </p>

                        {/* Review History */}
                        {driverApplication.reviews?.length > 0 && (
                            <div className="space-y-4">
                                {driverApplication.reviews.map((review, index) => (
                                    <div
                                        key={index}
                                        className={`p-4 rounded-xl border ${review.status === "rejected"
                                                ? "bg-red-50 border-red-200"
                                                : "bg-green-50 border-green-200"
                                            }`}
                                    >
                                        <p className="font-semibold capitalize">
                                            {review.status}
                                        </p>

                                        {review.reason && (
                                            <p className="text-sm mt-2 whitespace-pre-line">
                                                {review.reason}
                                            </p>
                                        )}

                                        <p className="text-xs mt-2 text-gray-500">
                                            Reviewed by {review.reviewed_by} on{" "}
                                            {new Date(review.reviewed_at).toLocaleString()}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Security Section */}
                <div className="bg-white p-8 rounded-3xl shadow">
                    <h2 className="text-xl font-bold mb-6">Security</h2>

                    {is2FAEnabled ? (
                        <div className="flex items-center justify-between">
                            <span className="text-green-600 font-semibold">
                                Two-Factor Authentication Enabled ✅
                            </span>

                            <button
                                onClick={disable2FA}
                                className="text-red-600 font-semibold"
                            >
                                Disable 2FA
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between">
                            <span className="text-slate-600">
                                Protect your account with Microsoft Authenticator
                            </span>

                            <button
                                onClick={() => navigate("/setup-2fa")}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700"
                            >
                                Enable 2FA
                            </button>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}