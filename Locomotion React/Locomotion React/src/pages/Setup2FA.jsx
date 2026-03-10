import { useEffect, useState } from "react";
import api from "../api/axios";

export default function Setup2FA() {
  const [qr, setQr] = useState(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    api.post("accounts/2fa/setup/").then((res) => {
      setQr(res.data.qr_code);
    });
  }, []);

  const confirm = async () => {
    await api.post("accounts/2fa/confirm/", { code });
    alert("2FA Enabled!");
  };

  return (
    <div className="p-10">
      <h2 className="text-xl font-bold mb-4">Scan QR with Microsoft Authenticator</h2>

      {qr && <img src={qr} alt="QR Code" className="mb-4" />}

      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter 6-digit code"
        className="border px-3 py-2"
      />

      <button onClick={confirm} className="ml-3 bg-indigo-600 text-white px-4 py-2 rounded">
        Confirm
      </button>
    </div>
  );
}