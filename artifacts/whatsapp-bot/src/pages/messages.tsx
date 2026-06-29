import { useState, useEffect } from "react";
import { useGetContacts, useGetMessages, useSendReply, getGetMessagesQueryKey, getGetContactsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { MessageSquare, Search, Send, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export default function Messages() {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const queryClient = useQueryClient();

  const { data: contacts, isLoading: contactsLoading } = useGetContacts({ query: { refetchInterval: 10000 } });
  const { data: messages, isLoading: messagesLoading } = useGetMessages(
    { contactId: selectedContactId },
    { query: { enabled: !!selectedContactId, refetchInterval: 5000 } }
  );

  // SSE real-time updates
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("new_message", () => {
      queryClient.invalidateQueries({ queryKey: getGetContactsQueryKey() });
      if (selectedContactId) {
        queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey({ contactId: selectedContactId }) });
      }
    });
    return () => es.close();
  }, [queryClient, selectedContactId]);

  const sendReplyMutation = useSendReply({
    mutation: {
      onSuccess: () => {
        setReplyText("");
        if (selectedContactId) {
          queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey({ contactId: selectedContactId }) });
        }
      }
    }
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedContactId) return;
    
    // Find the latest message to reply to
    const latestMessage = messages?.[messages.length - 1];
    if (latestMessage) {
      sendReplyMutation.mutate({ id: latestMessage.id, data: { text: replyText } });
    }
  };

  return (
    <div className="flex h-full flex-col md:flex-row bg-background border-t">
      {/* Contacts Sidebar */}
      <div className="w-full md:w-80 flex flex-col border-r bg-muted/10 h-full">
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search contacts..."
              className="pl-8 bg-background"
            />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          {contactsLoading ? (
            <div className="p-4 space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : contacts?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No contacts found
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {contacts?.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => setSelectedContactId(contact.id)}
                  className={cn(
                    "w-full text-left p-4 hover:bg-muted/50 transition-colors flex items-start gap-3",
                    selectedContactId === contact.id && "bg-primary/5 hover:bg-primary/10"
                  )}
                >
                  <Avatar>
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {contact.name?.substring(0, 2).toUpperCase() || <User className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="font-medium text-sm truncate">{contact.name || contact.phoneNumber}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {contact.lastMessageAt && format(new Date(contact.lastMessageAt), "MMM d")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      +{contact.phoneNumber}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col h-full bg-white">
        {selectedContactId ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-6 border-b flex items-center bg-background shadow-sm z-10">
              {contacts?.find(c => c.id === selectedContactId)?.name || 'Unknown Contact'}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-6">
              {messagesLoading ? (
                <div className="space-y-6">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                      <Skeleton className={cn("h-16 w-64 rounded-2xl", i % 2 === 0 ? "rounded-tl-sm" : "rounded-tr-sm")} />
                    </div>
                  ))}
                </div>
              ) : messages?.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No messages yet
                </div>
              ) : (
                <div className="space-y-6 flex flex-col justify-end min-h-full">
                  {messages?.map((message) => {
                    const isOutbound = message.direction === 'outbound';
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex max-w-[75%]",
                          isOutbound ? "ml-auto justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-2.5 shadow-sm",
                            isOutbound 
                              ? "bg-primary text-primary-foreground rounded-tr-sm" 
                              : "bg-muted rounded-tl-sm text-foreground"
                          )}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
                          <div className={cn(
                            "flex items-center gap-1.5 mt-1.5 justify-end",
                            isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {message.isAutoReply && (
                              <span className="text-[10px] bg-black/10 px-1.5 rounded-sm">Bot</span>
                            )}
                            <span className="text-[10px]">
                              {format(new Date(message.timestamp), "h:mm a")}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 bg-background border-t">
              <form onSubmit={handleSend} className="flex gap-3 max-w-4xl mx-auto">
                <Input
                  placeholder="Type a message..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 bg-muted/50 border-border/50 focus-visible:ring-primary/20"
                />
                <Button type="submit" disabled={!replyText.trim() || sendReplyMutation.isPending}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-gray-50/50">
            <MessageSquare className="h-12 w-12 mb-4 text-muted-foreground/30" />
            <p>Select a contact to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
}
