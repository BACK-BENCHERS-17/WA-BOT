import { useState, useEffect } from "react";
import { useGetSessionStatus, useConnectSession, useDisconnectSession, getGetSessionStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Smartphone, QrCode, PowerOff, AlertCircle, Copy, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Session() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  
  const { data: session, isLoading } = useGetSessionStatus({
    query: {
      refetchInterval: (data) => (data?.status === 'connecting' ? 3000 : false),
    }
  });

  const connectMutation = useConnectSession();
  const disconnectMutation = useDisconnectSession();

  const handleConnect = () => {
    connectMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSessionStatusQueryKey() });
        toast({ title: "Connecting...", description: "Requesting pairing code." });
      },
      onError: (err) => {
        toast({ title: "Connection failed", description: err.message || "Unknown error", variant: "destructive" });
      }
    });
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSessionStatusQueryKey() });
        toast({ title: "Disconnected", description: "WhatsApp session has been terminated." });
      },
      onError: (err) => {
        toast({ title: "Disconnect failed", description: err.message || "Unknown error", variant: "destructive" });
      }
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied", description: "Pairing code copied to clipboard." });
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50 p-8 flex items-center justify-center">
      <div className="w-full max-w-lg">
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-4">
              <Smartphone className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">WhatsApp Device Link</CardTitle>
            <CardDescription>
              Connect your WhatsApp Business account to enable auto-replies and message management.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            {isLoading ? (
              <div className="flex flex-col items-center space-y-4">
                <Skeleton className="h-12 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
              </div>
            ) : session?.status === 'connected' ? (
              <div className="flex flex-col items-center space-y-6">
                <div className="bg-green-50 text-green-700 p-4 rounded-lg flex items-center gap-3 w-full border border-green-200">
                  <div className="bg-green-100 p-2 rounded-full">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-green-900">Successfully Connected</h3>
                    <p className="text-sm">Ready to handle messages.</p>
                  </div>
                </div>

                <div className="w-full space-y-4 bg-muted/30 p-4 rounded-lg border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">Connected</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Phone Number</span>
                    <span className="font-medium">{session.phoneNumber ? `+${session.phoneNumber}` : 'Unknown'}</span>
                  </div>
                  {session.name && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Account Name</span>
                      <span className="font-medium">{session.name}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : session?.status === 'connecting' ? (
              <div className="flex flex-col items-center space-y-8 py-4">
                <div className="text-center space-y-2">
                  <h3 className="font-medium text-lg flex items-center justify-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                    Waiting for link...
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Follow the instructions below to link your device.
                  </p>
                </div>

                {connectMutation.data && (
                  <div className="w-full space-y-4 bg-muted/30 p-6 rounded-xl border flex flex-col items-center text-center">
                    <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Your Pairing Code</span>
                    <div className="flex items-center gap-4">
                      <code className="text-4xl font-mono font-bold tracking-widest text-primary bg-background px-4 py-2 rounded border shadow-sm">
                        {connectMutation.data.code}
                      </code>
                      <Button variant="outline" size="icon" onClick={() => copyCode(connectMutation.data.code)} className="h-12 w-12 rounded">
                        {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="w-full bg-blue-50 text-blue-800 p-4 rounded-lg text-sm space-y-2 border border-blue-200">
                  <p className="font-semibold flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" /> Instructions
                  </p>
                  <ol className="list-decimal list-inside space-y-1 ml-1 pl-2">
                    <li>Open WhatsApp on your phone</li>
                    <li>Tap Menu or Settings and select <strong>Linked Devices</strong></li>
                    <li>Tap on <strong>Link a Device</strong></li>
                    <li>Tap <strong>Link with phone number instead</strong> at the bottom</li>
                    <li>Enter the pairing code shown above</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-6 py-4 text-center">
                <div className="bg-muted p-6 rounded-full">
                  <QrCode className="h-12 w-12 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Not Connected</h3>
                  <p className="text-muted-foreground text-sm max-w-sm">
                    Link your WhatsApp account to start automating replies and managing conversations from this dashboard.
                  </p>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-center border-t bg-muted/10 p-6">
            {!isLoading && (
              session?.status === 'connected' ? (
                <Button variant="destructive" className="w-full" onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
                  <PowerOff className="mr-2 h-4 w-4" />
                  {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect WhatsApp"}
                </Button>
              ) : session?.status === 'connecting' ? (
                <Button variant="outline" className="w-full" onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
                  Cancel Connection
                </Button>
              ) : (
                <Button className="w-full" size="lg" onClick={handleConnect} disabled={connectMutation.isPending}>
                  {connectMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Generating Code...
                    </>
                  ) : (
                    <>Connect WhatsApp</>
                  )}
                </Button>
              )
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
