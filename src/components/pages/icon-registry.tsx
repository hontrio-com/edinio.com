import {
  Truck, ShieldCheck, RotateCcw, Phone, Mail, Clock, Star, Heart, Gift, Award,
  BadgeCheck, Check, CheckCircle, ThumbsUp, Zap, Sparkles, Tag, Percent, CreditCard,
  Wallet, Lock, Headphones, MessageCircle, Users, Smile, Leaf, Recycle, Globe, MapPin,
  Home, Store, Package, PackageCheck, Boxes, ShoppingBag, ShoppingCart, Wrench, Settings,
  Rocket, Trophy, Crown, Gem, Flame, Sun, Coffee, Utensils, Scissors, Camera, Music,
  Palette, PenTool, Book, Calendar, Bell, Eye, TrendingUp, BarChart3, DollarSign, HandCoins,
  Handshake, Banknote, Timer, Send, Sprout, Droplet, Dumbbell, Baby, PawPrint, Stethoscope,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Curated, explicitly-imported set of lucide icons available to the "Beneficii"
 * block icon picker (and rendered on the storefront). Explicit imports keep the
 * bundle small (vs. importing all of lucide). Isomorphic — no hooks, usable from
 * server and client.
 */
export const PAGE_ICONS: Record<string, LucideIcon> = {
  Truck, ShieldCheck, RotateCcw, Phone, Mail, Clock, Star, Heart, Gift, Award,
  BadgeCheck, Check, CheckCircle, ThumbsUp, Zap, Sparkles, Tag, Percent, CreditCard,
  Wallet, Lock, Headphones, MessageCircle, Users, Smile, Leaf, Recycle, Globe, MapPin,
  Home, Store, Package, PackageCheck, Boxes, ShoppingBag, ShoppingCart, Wrench, Settings,
  Rocket, Trophy, Crown, Gem, Flame, Sun, Coffee, Utensils, Scissors, Camera, Music,
  Palette, PenTool, Book, Calendar, Bell, Eye, TrendingUp, BarChart3, DollarSign, HandCoins,
  Handshake, Banknote, Timer, Send, Sprout, Droplet, Dumbbell, Baby, PawPrint, Stethoscope,
};

/** Legacy lowercase aliases used by older trust blocks. */
const LEGACY: Record<string, LucideIcon> = {
  truck: Truck,
  shield: ShieldCheck,
  "rotate-ccw": RotateCcw,
  phone: Phone,
};

export const PAGE_ICON_NAMES = Object.keys(PAGE_ICONS);

export function resolveIcon(name: string | undefined | null): LucideIcon {
  if (!name) return ShieldCheck;
  return PAGE_ICONS[name] ?? LEGACY[name] ?? ShieldCheck;
}

export function PageIcon({ name, className, size }: { name?: string | null; className?: string; size?: number }) {
  // Property-access lookup (not a function call) so the linter sees a stable component.
  const Icon = (name ? (PAGE_ICONS[name] ?? LEGACY[name]) : undefined) ?? ShieldCheck;
  return <Icon className={className} size={size} />;
}
