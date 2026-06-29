import { useState } from "react";
import { 
  useGetBotConfig, 
  useUpdateBotConfig, 
  useGetBotRules, 
  useCreateBotRule, 
  useUpdateBotRule, 
  useDeleteBotRule,
  getGetBotConfigQueryKey,
  getGetBotRulesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, Plus, Save, Bot as BotIcon, Clock, Zap } from "lucide-react";
import type { BotRule, BotRuleInputMatchType } from "@workspace/api-client-react";

export default function BotConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: config, isLoading: configLoading } = useGetBotConfig();
  const { data: rules, isLoading: rulesLoading } = useGetBotRules();
  
  const updateConfigMutation = useUpdateBotConfig();
  const createRuleMutation = useCreateBotRule();
  const updateRuleMutation = useUpdateBotRule();
  const deleteRuleMutation = useDeleteBotRule();

  // Local state for config form
  const [formData, setFormData] = useState({
    enabled: false,
    businessName: "",
    greeting: "",
    refundPolicy: "",
    autoReplyDelay: 0,
    workingHoursEnabled: false,
    workingHoursStart: "09:00",
    workingHoursEnd: "17:00"
  });

  // Init form data when config loads
  const initialized = useState(false);
  if (config && !initialized[0]) {
    setFormData({
      enabled: config.enabled,
      businessName: config.businessName || "",
      greeting: config.greeting || "",
      refundPolicy: config.refundPolicy || "",
      autoReplyDelay: config.autoReplyDelay || 0,
      workingHoursEnabled: config.workingHoursEnabled || false,
      workingHoursStart: config.workingHoursStart || "09:00",
      workingHoursEnd: config.workingHoursEnd || "17:00"
    });
    initialized[1](true);
  }

  const handleSaveConfig = () => {
    updateConfigMutation.mutate(
      { data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetBotConfigQueryKey() });
          toast({ title: "Settings Saved", description: "Bot configuration has been updated." });
        }
      }
    );
  };

  // Rule management
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BotRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    keyword: "",
    response: "",
    matchType: "exact" as BotRuleInputMatchType,
    enabled: true
  });

  const openRuleDialog = (rule?: BotRule) => {
    if (rule) {
      setEditingRule(rule);
      setRuleForm({
        keyword: rule.keyword,
        response: rule.response,
        matchType: rule.matchType as BotRuleInputMatchType,
        enabled: rule.enabled
      });
    } else {
      setEditingRule(null);
      setRuleForm({ keyword: "", response: "", matchType: "exact", enabled: true });
    }
    setRuleDialogOpen(true);
  };

  const handleSaveRule = () => {
    if (editingRule) {
      updateRuleMutation.mutate(
        { id: editingRule.id, data: ruleForm },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetBotRulesQueryKey() });
            toast({ title: "Rule Updated", description: "The auto-reply rule was updated." });
            setRuleDialogOpen(false);
          }
        }
      );
    } else {
      createRuleMutation.mutate(
        { data: ruleForm },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetBotRulesQueryKey() });
            toast({ title: "Rule Created", description: "New auto-reply rule added." });
            setRuleDialogOpen(false);
          }
        }
      );
    }
  };

  const handleDeleteRule = (id: number) => {
    if (confirm("Are you sure you want to delete this rule?")) {
      deleteRuleMutation.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetBotRulesQueryKey() });
            toast({ title: "Rule Deleted", description: "The auto-reply rule was removed." });
          }
        }
      );
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50 p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Bot Configuration</h1>
          <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-lg border shadow-sm">
            <Label htmlFor="bot-enabled" className="font-semibold cursor-pointer">Bot Status</Label>
            <Switch 
              id="bot-enabled" 
              checked={formData.enabled} 
              onCheckedChange={(c) => {
                setFormData({ ...formData, enabled: c });
                updateConfigMutation.mutate({ data: { ...formData, enabled: c } }, {
                  onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBotConfigQueryKey() })
                });
              }}
            />
          </div>
        </div>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="general">General Settings</TabsTrigger>
            <TabsTrigger value="rules">Auto-Reply Rules</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BotIcon className="w-5 h-5" /> Business Profile</CardTitle>
                <CardDescription>Configure how the bot identifies your business.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input 
                    value={formData.businessName} 
                    onChange={(e) => setFormData({...formData, businessName: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Default Greeting</Label>
                  <Textarea 
                    value={formData.greeting} 
                    onChange={(e) => setFormData({...formData, greeting: e.target.value})}
                    placeholder="Hello! Welcome to our store..."
                    className="min-h-[100px]"
                  />
                  <p className="text-xs text-muted-foreground">Sent to users messaging you for the first time.</p>
                </div>
                <div className="space-y-2">
                  <Label>Refund Policy Snippet</Label>
                  <Textarea 
                    value={formData.refundPolicy} 
                    onChange={(e) => setFormData({...formData, refundPolicy: e.target.value})}
                    className="min-h-[100px]"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" /> Behavior & Hours</CardTitle>
                <CardDescription>Set when and how the bot replies.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                  <div className="space-y-0.5">
                    <Label className="text-base">Working Hours</Label>
                    <p className="text-sm text-muted-foreground">Only auto-reply outside working hours</p>
                  </div>
                  <Switch 
                    checked={formData.workingHoursEnabled} 
                    onCheckedChange={(c) => setFormData({...formData, workingHoursEnabled: c})} 
                  />
                </div>
                
                {formData.workingHoursEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <Input 
                        type="time" 
                        value={formData.workingHoursStart} 
                        onChange={(e) => setFormData({...formData, workingHoursStart: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input 
                        type="time" 
                        value={formData.workingHoursEnd} 
                        onChange={(e) => setFormData({...formData, workingHoursEnd: e.target.value})} 
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Auto-Reply Delay (seconds)</Label>
                  <Input 
                    type="number" 
                    min="0" max="60"
                    value={formData.autoReplyDelay} 
                    onChange={(e) => setFormData({...formData, autoReplyDelay: parseInt(e.target.value) || 0})} 
                  />
                  <p className="text-xs text-muted-foreground">Makes the bot feel more human. Default is 0.</p>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/30 border-t px-6 py-4">
                <Button onClick={handleSaveConfig} disabled={updateConfigMutation.isPending} className="ml-auto">
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5" /> Response Rules</CardTitle>
                  <CardDescription>Automatically reply based on keywords.</CardDescription>
                </div>
                <Button onClick={() => openRuleDialog()}>
                  <Plus className="w-4 h-4 mr-2" /> Add Rule
                </Button>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Keyword</TableHead>
                        <TableHead>Match Type</TableHead>
                        <TableHead>Response</TableHead>
                        <TableHead className="w-[100px] text-center">Hits</TableHead>
                        <TableHead className="w-[100px] text-center">Status</TableHead>
                        <TableHead className="w-[100px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rulesLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center">Loading rules...</TableCell>
                        </TableRow>
                      ) : rules?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                            No rules configured. Click "Add Rule" to create one.
                          </TableCell>
                        </TableRow>
                      ) : (
                        rules?.map((rule) => (
                          <TableRow key={rule.id}>
                            <TableCell className="font-medium">{rule.keyword}</TableCell>
                            <TableCell>
                              <span className="bg-secondary text-secondary-foreground px-2 py-1 rounded text-xs capitalize">
                                {rule.matchType}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[300px] truncate text-muted-foreground">
                              {rule.response}
                            </TableCell>
                            <TableCell className="text-center font-mono text-sm">{rule.triggerCount}</TableCell>
                            <TableCell className="text-center">
                              <Switch 
                                checked={rule.enabled} 
                                onCheckedChange={(c) => updateRuleMutation.mutate({ 
                                  id: rule.id, 
                                  data: { ...rule, enabled: c } 
                                }, {
                                  onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBotRulesQueryKey() })
                                })}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => openRuleDialog(rule)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteRule(rule.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Rule Dialog */}
        <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingRule ? 'Edit Rule' : 'Create Rule'}</DialogTitle>
              <DialogDescription>Define when and how the bot should automatically reply.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Keyword</Label>
                <Input 
                  className="col-span-3" 
                  value={ruleForm.keyword}
                  onChange={(e) => setRuleForm({...ruleForm, keyword: e.target.value})}
                  placeholder="e.g. price, hours, location"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Match Type</Label>
                <Select 
                  value={ruleForm.matchType} 
                  onValueChange={(val: BotRuleInputMatchType) => setRuleForm({...ruleForm, matchType: val})}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exact">Exact Match</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="startsWith">Starts With</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right mt-2">Response</Label>
                <Textarea 
                  className="col-span-3 min-h-[100px]" 
                  value={ruleForm.response}
                  onChange={(e) => setRuleForm({...ruleForm, response: e.target.value})}
                  placeholder="Type the message the bot will send..."
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Enabled</Label>
                <Switch 
                  className="col-span-3"
                  checked={ruleForm.enabled}
                  onCheckedChange={(c) => setRuleForm({...ruleForm, enabled: c})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleSaveRule} 
                disabled={!ruleForm.keyword || !ruleForm.response || createRuleMutation.isPending || updateRuleMutation.isPending}
              >
                Save Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
