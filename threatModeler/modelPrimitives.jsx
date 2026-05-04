import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Inp = ({ className, ...props }) => (
  <Input className={cn("h-10 bg-muted/50 text-sm", className)} {...props} />
);

export const Sel = ({ children, className, style, ...props }) => (
  <select
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    style={style}
    {...props}
  >
    {children}
  </select>
);

export const Txt = ({ className, ...props }) => (
  <Textarea className={cn("min-h-20 resize-y bg-muted/50 text-sm", className)} {...props} />
);

export const Btn = ({ className, variant = "outline", ...props }) => (
  <Button className={cn("h-10", className)} variant={variant} {...props} />
);

export const Fld = ({ label, children, span }) => (
  <div style={{ marginBottom: 12, gridColumn: span ? "1/-1" : undefined }}>
    <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</Label>
    {children}
  </div>
);

export const Err = ({ msg }) =>
  msg ? (
    <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      Error: {msg}
    </div>
  ) : null;

export const Pill = ({ label, value, color }) => (
  <div style={{ background: `${color}15`, border: `1px solid ${color}40` }} className="min-w-[88px] rounded-md px-4 py-1.5 text-center">
    <div style={{ color }} className="font-semibold text-xl">{value}</div>
    <div className="text-[11px] text-muted-foreground">{label}</div>
  </div>
);

export const Tag = ({ label, color, bg }) => (
  <Badge
    variant="outline"
    style={{ background: bg || `${color}20`, color, borderColor: `${color}40` }}
    className="rounded px-2 py-0.5 text-[11px]"
  >
    {label}
  </Badge>
);

export const AiBtn = ({ onClick, loading, label, style, className }) => (
  <Button
    onClick={onClick}
    disabled={loading}
    className={cn("h-10 flex-1", className)}
    style={{ ...style, background: "linear-gradient(135deg, #436086 0%, #375479 100%)" }}
  >
    {loading ? "Processing with Gemini..." : label}
  </Button>
);

export const SHdr = ({ n, title, sub }) => (
  <div className="mb-5">
    <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">Step {n} of 6</div>
    <h2 className="m-0 text-2xl font-bold text-foreground">{title}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
  </div>
);
