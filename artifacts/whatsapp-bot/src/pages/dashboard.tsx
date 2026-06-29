import { useGetStatsSummary, useGetActivityFeed, useGetSessionStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Zap, Users, CheckCircle, Activity, Smartphone, PowerOff, RefreshCw } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetStatsSummary();
  const { data: activity, isLoading: activityLoading } = useGetActivityFeed();
  const { data: session, isLoading: sessionLoading } = useGetSessionStatus();

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50 p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Overview</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Session Status</CardTitle>
              {sessionLoading ? (
                <Skeleton className="h-4 w-4 rounded-full" />
              ) : session?.status === 'connected' ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : session?.status === 'connecting' ? (
                <RefreshCw className="h-4 w-4 text-yellow-600 animate-spin" />
              ) : (
                <PowerOff className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              {sessionLoading ? (
                <Skeleton className="h-8 w-[100px]" />
              ) : (
                <div className="text-2xl font-bold capitalize">{session?.status || 'Disconnected'}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {session?.phoneNumber ? `+${session.phoneNumber}` : 'No active number'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-[100px]" />
              ) : (
                <div className="text-2xl font-bold">{stats?.totalMessages?.toLocaleString() || 0}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {stats?.inboundToday?.toLocaleString() || 0} inbound today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Auto-Replied Today</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-[100px]" />
              ) : (
                <div className="text-2xl font-bold">{stats?.autoRepliedToday?.toLocaleString() || 0}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Bot is {stats?.botEnabled ? 'enabled' : 'disabled'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Contacts</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-[100px]" />
              ) : (
                <div className="text-2xl font-bold">{stats?.activeContacts?.toLocaleString() || 0}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {stats?.responseRate ? `${(stats.responseRate * 100).toFixed(1)}% response rate` : 'No data'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest events from your WhatsApp bot</CardDescription>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-[250px]" />
                        <Skeleton className="h-3 w-[200px]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activity?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Activity className="h-8 w-8 mb-4 text-muted-foreground/50" />
                  <p>No recent activity</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {activity?.map((item) => (
                    <div key={item.id} className="flex items-start space-x-4">
                      <div className="mt-0.5 rounded-full bg-primary/10 p-2">
                        {item.type === 'message_received' && <MessageSquare className="h-4 w-4 text-primary" />}
                        {item.type === 'auto_reply_sent' && <Zap className="h-4 w-4 text-primary" />}
                        {item.type === 'manual_reply_sent' && <Smartphone className="h-4 w-4 text-primary" />}
                        {(item.type === 'session_connected' || item.type === 'session_disconnected') && (
                          <Activity className="h-4 w-4 text-primary" />
                        )}
                        {item.type === 'rule_triggered' && <CheckCircle className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {item.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.contactName && <span className="font-medium text-foreground mr-1">{item.contactName} •</span>}
                          {format(new Date(item.timestamp), "MMM d, h:mm a")}
                        </p>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {item.type.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
