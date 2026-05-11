"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

const IS_DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";

function SSOHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Autenticando...");
  const [devLoading, setDevLoading] = useState(false);
  const authenticatedRef = useRef(false);

  const devLogin = useCallback(async () => {
    if (authenticatedRef.current) return;
    setDevLoading(true);
    try {
      const response = await fetch("/api/auth/dev-login", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Dev login falhou");
        setDevLoading(false);
        return;
      }
      authenticatedRef.current = true;
      router.replace("/dashboard");
    } catch {
      setError("Erro de conexão no dev-login.");
      setDevLoading(false);
    }
  }, [router]);

  const authenticate = useCallback(
    async (userId: string, companyId: string, locationId: string) => {
      if (authenticatedRef.current) return;
      authenticatedRef.current = true;

      setStatus("Validando credenciais...");

      try {
        const response = await fetch("/api/auth/sso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            company_id: companyId,
            location_id: locationId,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Erro ao autenticar");
          authenticatedRef.current = false;
          return;
        }

        setStatus("Redirecionando...");
        router.replace("/dashboard");
      } catch {
        setError("Erro de conexão. Tente novamente.");
        authenticatedRef.current = false;
      }
    },
    [router]
  );

  useEffect(() => {
    // Fallback de companyId via env publica — usado SO se o GHL nao enviar
    // o companyId via query param/postMessage (caso raro).
    const FALLBACK_COMPANY_ID = process.env.NEXT_PUBLIC_GHL_COMPANY_ID || "";

    // 1. Tentar via query params (ex: ?user_id=X&company_id=Y&location_id=Z)
    const userId = searchParams.get("user_id") || searchParams.get("userId");
    const companyIdParam = searchParams.get("company_id") || searchParams.get("companyId");
    const locationId = searchParams.get("location_id") || searchParams.get("locationId");

    if (userId && locationId) {
      const cid = companyIdParam || FALLBACK_COMPANY_ID;
      if (!cid) {
        setError("company_id ausente. Configure NEXT_PUBLIC_GHL_COMPANY_ID ou inclua &company_id={{company.id}} na URL do Custom Menu Link.");
        return;
      }
      authenticate(userId, cid, locationId);
      return;
    }

    // 2. Escutar postMessage do GHL (Custom Menu Link envia dados via iframe postMessage)
    setStatus("Aguardando dados...");

    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      const uid = data.userId || data.user_id || data.activeUser?.id;
      const lid = data.locationId || data.location_id || data.activeLocation;
      const cid =
        data.companyId ||
        data.company_id ||
        data.activeCompany ||
        data.companyId?.toString?.() ||
        FALLBACK_COMPANY_ID;

      if (uid && lid && cid) {
        authenticate(uid, cid, lid);
      }
    }

    window.addEventListener("message", handleMessage);

    // 3. Tentar extrair da URL do GHL (o path pode conter o locationId)
    const pathMatch = window.location.href.match(/location\/([a-zA-Z0-9]+)/);
    if (pathMatch) {
      // Se temos o locationId no path mas faltam outros params, aguardar postMessage
      setStatus("Aguardando autenticação...");
    }

    // 4. Timeout - se nao receber dados em 5s, mostrar erro com instrucoes
    const timeout = setTimeout(() => {
      if (!authenticatedRef.current) {
        setError(
          "Não foi possível obter os dados de autenticação. Verifique se a URL do Custom Menu Link está configurada como: " +
          window.location.origin +
          "/?user_id={{user.id}}&company_id={{company.id}}&location_id={{location.id}}"
        );
      }
    }, 8000);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timeout);
    };
  }, [searchParams, authenticate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="text-center max-w-lg px-6">
          <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-xl font-bold">!</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Erro de autenticação
          </h1>
          <p className="text-sm text-gray-500 break-words">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500 mx-auto mb-4" />
        <p className="text-sm text-gray-400">{status}</p>
        {IS_DEV_MODE && (
          <button
            type="button"
            onClick={devLogin}
            disabled={devLoading}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-60"
          >
            {devLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            Entrar como dev (location fixa)
          </button>
        )}
      </div>
    </div>
  );
}

export default function SSOEntryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-transparent">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500 mx-auto mb-4" />
            <p className="text-sm text-gray-400">Carregando...</p>
          </div>
        </div>
      }
    >
      <SSOHandler />
    </Suspense>
  );
}
