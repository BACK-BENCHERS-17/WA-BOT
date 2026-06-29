import { useState, useEffect } from "react";
import {
  useGetSessionStatus,
  useConnectSession,
  useDisconnectSession,
  getGetSessionStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Smartphone, PowerOff, AlertCircle, Copy, Check, RefreshCw, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Session() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [blockedError, setBlockedError] = useState(false);

  const { data: session, isLoading } = useGetSessionStatus({
    query: {
      refetchInterval: (data) =>
        data?.status === "connecting" ? 2000 : 5000,
    },
  });

  const connectMutation = useConnectSession();
  const disconnectMutation = useDisconnectSession();

  // SSE for real-time session updates
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("session_update", () => {
      queryClient.invalidateQueries({ queryKey: getGetSessionStatusQueryKey() });
    });
    return () => es.close();
  }, [queryClient]);

  const handleConnect = () => {
    const cleaned = phoneNumber.replace(/\D/g, "");
    if (!cleaned || cleaned.length < 10) {
      toast({
        title: "Phone number required",
        description: "Enter your number with country code, e.g. 919876543210",
        variant: "destructive",
      });
      return;
    }
    connectMutation.mutate(
      { data: { phoneNumber: cleaned } },
      {
        onSuccess: (data) => {
          setPairingCode(data.code);
          queryClient.invalidateQueries({ queryKey: getGetSessionStatusQueryKey() });
          toast({ title: "Pairing code ready", description: "Enter this code in WhatsApp on your phone." });
        },
        onError: (err: any) => {
          const status = (err as any)?.response?.status;
          const body = (err as any)?.response?.data ?? {};
          if (status === 503 || body?.error === "DATACENTER_BLOCKED" || (body?.message ?? "").includes("datacenter") || (body?.message ?? "").includes("WhatsApp blocks")) {
            setBlockedError(true);
          } else {
            toast({
              title: "Connection failed",
              description: body?.message ?? err?.message ?? "Unknown error",
              variant: "destructive",
            });
          }
        },
      }
    );
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        setPairingCode(null);
        setPhoneNumber("");
        queryClient.invalidateQueries({ queryKey: getGetSessionStatusQueryKey() });
        toast({ title: "Disconnected", description: "WhatsApp session terminated." });
      },
      onError: (err: any) => {
        toast({ title: "Disconnect failed", description: err?.message ?? "Unknown error", variant: "destructive" });
      },
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast({ title: "Copied", description: "Pairing code copied to clipboard." });
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50 p-8 flex items-center justify-center">
      <div className="w-full max-w-lg space-y-4">

        {/* How to link guide */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-1">
          <p className="font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> How pairing works
          </p>
          <ol className="list-decimal list-inside ml-1 space-y-0.5">
            <li>Enter your WhatsApp number with country code (no spaces)</li>
            <li>Click <strong>Generate Pairing Code</strong></li>
            <li>Open WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device</li>
            <li>Tap <strong>Link with phone number instead</strong> and enter the code</li>
          </ol>
        </div>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-3">
              <Smartphone className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">WhatsApp Device Link</CardTitle>
            <CardDescription>
              Connect your WhatsApp account to enable the auto-reply bot.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            {isLoading ? (
              <div className="flex flex-col items-center space-y-4">
                <Skeleton className="h-12 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
              </div>
            ) : session?.status === "connected" ? (
              <div className="flex flex-col items-center space-y-5">
                <div className="bg-green-50 text-green-700 p-4 rounded-lg flex items-center gap-3 w-full border border-green-200">
                  <div className="bg-green-100 p-2 rounded-full">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-green-900">Connected — Bot is live</h3>
                    <p className="text-sm">Incoming messages will be auto-replied based on your rules.</p>
                  </div>
                </div>
                <div className="w-full space-y-3 bg-muted/30 p-4 rounded-lg border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">Connected</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Phone</span>
                    <span className="font-medium font-mono">
                      {session.phoneNumber ? `+${session.phoneNumber}` : "—"}
                    </span>
                  </div>
                  {session.name && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Account Name</span>
                      <span className="font-medium">{session.name}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : session?.status === "connecting" ? (
              <div className="flex flex-col items-center space-y-6 py-2 text-center">
                <div className="space-y-2">
                  <h3 className="font-medium text-lg flex items-center justify-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                    Waiting for you to enter the code...
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Open WhatsApp on your phone and enter the code below.
                  </p>
                </div>

                {pairingCode && (
                  <div className="w-full bg-muted/30 p-6 rounded-xl border flex flex-col items-center gap-4">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                      Pairing Code
                    </span>
                    <div className="flex items-center gap-4">
                      <code
                        data-testid="pairing-code"
                        className="text-5xl font-mono font-bold tracking-[0.25em] text-primary bg-background px-6 py-3 rounded-lg border shadow-sm select-all"
                      >
                        {pairingCode}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyCode(pairingCode)}
                        data-testid="button-copy-code"
                        className="h-12 w-12 rounded-lg"
                      >
                        {copied ? (
                          <Check className="h-5 w-5 text-green-600" />
                        ) : (
                          <Copy className="h-5 w-5" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Code expires in ~5 minutes</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col space-y-5 py-2">
                <div className="space-y-2">
                  <Label htmlFor="phone-input" className="text-sm font-medium">
                    WhatsApp Phone Number
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone-input"
                      data-testid="input-phone-number"
                      type="tel"
                      placeholder="919876543210  (country code + number)"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="pl-9 font-mono text-base"
                      onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Include country code without + or spaces. E.g. India: 91XXXXXXXXXX
                  </p>
                </div>

                {blockedError && (
                  <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-4 text-sm space-y-3">
                    <p className="font-semibold flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      WhatsApp blocks cloud server IPs
                    </p>
                    <p>
                      WhatsApp rejects WebSocket connections from datacenter servers (Replit, AWS, etc.) during development.
                      This is normal — the bot is ready to work on a VPS.
                    </p>
                    <div className="bg-amber-100 rounded-md p-3 space-y-1 font-mono text-xs">
                      <p className="font-semibold font-sans text-xs uppercase tracking-wide">To connect your WhatsApp:</p>
                      <p>1. Click <strong>Publish</strong> in Replit to deploy</p>
                      <p>2. Open your deployed <strong>.replit.app</strong> URL</p>
                      <p>3. Go to <strong>Session</strong> page and enter your number</p>
                      <p>4. The pairing code will appear — enter it in WhatsApp</p>
                    </div>
                    <button
                      className="text-xs underline text-amber-700"
                      onClick={() => setBlockedError(false)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                {!blockedError && session?.status === "error" && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Connection error. Check your phone number and try again.</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-center border-t bg-muted/10 p-5">
            {!isLoading &&
              (session?.status === "connected" ? (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-disconnect"
                >
                  <PowerOff className="mr-2 h-4 w-4" />
                  {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect WhatsApp"}
                </Button>
              ) : session?.status === "connecting" ? (
                <div className="w-full space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleDisconnect}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-cancel"
                  >
                    Cancel &amp; Start Over
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleConnect}
                  disabled={connectMutation.isPending}
                  data-testid="button-connect"
                >
                  {connectMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Generating Code...
                    </>
                  ) : (
                    <>
                      <Smartphone className="mr-2 h-4 w-4" />
                      Generate Pairing Code
                    </>
                  )}
                </Button>
              ))}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
