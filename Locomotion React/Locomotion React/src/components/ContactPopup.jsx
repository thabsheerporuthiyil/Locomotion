export default function ContactPopup({ open, onClose, phone, remaining, blocked, message, onViewPlan }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl animate-fadeIn text-center">

        {blocked ? (
          <>
            <h2 className="text-xl font-bold mb-2 text-red-600">Limit Exceeded</h2>
            <p className="mb-6 text-gray-700">{message || "You have reached your free contact limit."}</p>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-xl hover:bg-gray-300 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={onViewPlan}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-xl hover:bg-indigo-700 transition font-medium"
              >
                View Plan
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-2">Contact Driver</h2>

            <p className="mb-4 text-gray-700">
              📞{" "}
              <a
                href={`tel:${phone}`}
                className="text-blue-600 font-semibold hover:underline"
              >
                {phone}
              </a>
            </p>

            {typeof remaining === "number" && (
              <p className="text-xs text-gray-400 mb-3">
                Free contacts left: {remaining}
              </p>
            )}

            <button
              onClick={onClose}
              className="w-full bg-gray-900 text-white py-2 rounded-xl hover:bg-gray-800 transition"
            >
              Close
            </button>
          </>
        )}

      </div>
    </div>
  );
}
