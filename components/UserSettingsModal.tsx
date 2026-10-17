"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useAnimatedClose } from "@/lib/useAnimatedClose";
import { cn } from "@/lib/utils";
import {
  Accessibility, Award, Bell, Check, ChevronRight, Circle, Eye, ImagePlus, Link2, LogOut, MessageSquare, Pencil, Plus, Trash2,
  Gamepad2, Mic, Monitor, Palette, Settings2, Shield, UserRound, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TurnstileCaptcha } from "@/components/auth/TurnstileCaptcha";
import { MfaSettings } from "@/components/auth/MfaSettings";
import { emailInputSchema } from "@/lib/validation/auth";
import type { MemberItem } from "@/components/MemberList";
import { CustomBadgeList } from "@/components/CustomBadgeList";
import type { CustomBadge } from "@/lib/badges";
import { useTheme } from "@/lib/useTheme";
import { ProfileImageCropModal, ProfileImagePickerModal } from "@/components/ProfileImageModals";
import type { ImageCrop, ProfileImageKind, SelectedProfileMedia } from "@/components/ProfileImageModals";
import { CroppedProfileImage } from "@/components/ProfileBanner";
import { MemberListBannerPreview } from "@/components/MemberListBannerArt";
import { ProfileDecoration, ProfileDecorationPicker } from "@/components/ProfileDecoration";
import { isMissingProfileDecorationColumn, normalizeProfileDecoration, type ProfileDecorationId } from "@/lib/profileDecorations";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { SpotifyConnections } from "@/components/SpotifyConnections";
import { VoiceSettingsPanel } from "@/components/VoiceSettingsPanel";
import { OverlaySettingsPanel } from "@/components/OverlaySettingsPanel";
import { RegisteredGamesSettingsPanel } from "@/components/RegisteredGamesSettingsPanel";
import { CHAT_PREFERENCES_EVENT, DEFAULT_CHAT_DISPLAY, type ChatDisplayPreferences } from "@/lib/chatPreferences";

type Section = "perfil" | "aparencia" | "mensagens" | "acessibilidade" | "privacidade" | "conta" | "conexoes" | "insignias" | "voz" | "sobreposicao" | "jogos";
type Presence = "online" | "idle" | "dnd" | "offline";
type Preferences = { density: "comfortable" | "compact"; fontScale: "normal" | "large"; reducedMotion: boolean; chat: ChatDisplayPreferences };

interface UserSettingsModalProps {
  userId: string;
  serverId?: string | null;
  serverName?: string;
  members?: MemberItem[];
  initialSection?: Section;
  initial: {
    displayName: string;
    username?: string | null;
    pronouns?: string | null;
    bio?: string | null;
    customStatus?: string | null;
    avatarUrl?: string | null;
    avatarPositionX?: number | null;
    avatarPositionY?: number | null;
    avatarZoom?: number | null;
    bannerUrl?: string | null;
    bannerPositionX?: number | null;
    bannerPositionY?: number | null;
    bannerZoom?: number | null;
    activityBannerUrl?: string | null;
    memberListBannerUrl?: string | null;
    memberListBannerPositionX?: number | null;
    memberListBannerPositionY?: number | null;
    memberListBannerZoom?: number | null;
    profileCardColor?: string | null;
    profileDecoration?: string | null;
    showBadgesInMemberList?: boolean | null;
    badges?: CustomBadge[];
    presence?: Presence | null;
  };
  onClose: () => void;
  onSaved: () => void;
}

const NAV: { id: Section; label: string; icon: typeof UserRound; group: string }[] = [
  { id: "perfil", label: "Meu perfil", icon: UserRound, group: "Conta" },
  { id: "privacidade", label: "Privacidade", icon: Shield, group: "Conta" },
  { id: "conta", label: "Minha conta", icon: Settings2, group: "Conta" },
  { id: "aparencia", label: "Aparência", icon: Palette, group: "Aplicativo" },
  { id: "mensagens", label: "Mensagens", icon: MessageSquare, group: "Aplicativo" },
  { id: "acessibilidade", label: "Acessibilidade", icon: Accessibility, group: "Aplicativo" },
  { id: "voz", label: "Voz e vídeo", icon: Mic, group: "Aplicativo" },
  { id: "sobreposicao", label: "Sobreposição de jogo", icon: Monitor, group: "Aplicativo" },
  { id: "jogos", label: "Jogos registrados", icon: Gamepad2, group: "Jogos e apps" },
  { id: "conexoes", label: "Conexões", icon: Link2, group: "Conexões" },
  { id: "insignias", label: "Insígnias", icon: Award, group: "Gestão" },
];

const PROFILE_CARD_COLORS = ["#111216", "#202127", "#292d46", "#40244f", "#173c38", "#4a2632"];
const DEFAULT_PROFILE_CARD_COLOR = "#202127";

function readProfileCardColors(value?: string | null) {
  const colors = value?.match(/#[\da-f]{6}/gi)?.slice(0, 3) ?? [];
  return colors.length ? colors : ["#202127"];
}

const DEFAULT_PREFERENCES: Preferences = { density: "comfortable", fontScale: "normal", reducedMotion: false, chat: DEFAULT_CHAT_DISPLAY };
type ImageScope = "user" | "server";
type ImageEditorTarget = { kind: ProfileImageKind; scope: ImageScope; src: string; file: File | null; crop: ImageCrop; pending: boolean };
type BadgeTargetUser = { id: string; displayName: string; username: string | null };
const DEFAULT_CROP: ImageCrop = { x: 50, y: 50, zoom: 100 };
const PRESENCE: { id: Presence; label: string; description: string; color: string }[] = [
  { id: "online", label: "Online", description: "Disponível para conversar", color: "bg-emerald-400" },
  { id: "idle", label: "Ausente", description: "Mostrar como ausente", color: "bg-amber-400" },
  { id: "dnd", label: "Não perturbe", description: "Mostrar que não quer interrupções", color: "bg-rose-500" },
  { id: "offline", label: "Invisível", description: "Aparecer desconectado", color: "bg-gray-500" },
];

function loadPreferences(userId: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(`sekai-preferences:${userId}`) || "null");
    if (!value || typeof value !== "object") return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...value, chat: { ...DEFAULT_CHAT_DISPLAY, ...(value.chat ?? {}) } };
  } catch { return DEFAULT_PREFERENCES; }
}

const PROFILE_IMAGE_FORMATS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
const PROFILE_IMAGE_TYPE_BY_EXTENSION: Record<string, keyof typeof PROFILE_IMAGE_FORMATS> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function profileImageUploadFormat(file: File) {
  const rawType = file.type.trim().toLowerCase();
  const normalizedType = rawType === "image/jpg" ? "image/jpeg" : rawType;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = normalizedType in PROFILE_IMAGE_FORMATS
    ? normalizedType as keyof typeof PROFILE_IMAGE_FORMATS
    : !rawType ? PROFILE_IMAGE_TYPE_BY_EXTENSION[extension] : undefined;
  if (!contentType) return null;
  return { contentType, extension: PROFILE_IMAGE_FORMATS[contentType] };
}

export function UserSettingsModal({ userId, serverId, serverName, initial, initialSection = "perfil", onClose, onSaved }: UserSettingsModalProps) {
  const supabase = createClient();
  const { theme, setTheme, themes } = useTheme();
  const [section, setSection] = useState<Section>(initialSection);
  const [desktopOverlayAvailable, setDesktopOverlayAvailable] = useState(false);
  const [profileScope, setProfileScope] = useState<"user" | "server">("user");
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [username, setUsername] = useState(initial.username ?? "");
  const [pronouns, setPronouns] = useState(initial.pronouns ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [customStatus, setCustomStatus] = useState(initial.customStatus ?? "");
  const [presence, setPresence] = useState<Presence>(initial.presence ?? "online");
  const [showBadgesInMemberList, setShowBadgesInMemberList] = useState(initial.showBadgesInMemberList !== false);
  const [profileDecoration, setProfileDecoration] = useState<ProfileDecorationId | null>(normalizeProfileDecoration(initial.profileDecoration));
  const [profileBadges, setProfileBadges] = useState<CustomBadge[]>(initial.badges ?? []);
  const [profileCardMode, setProfileCardMode] = useState<"default" | "solid" | "gradient">(() => !initial.profileCardColor || initial.profileCardColor.trim().toLowerCase() === DEFAULT_PROFILE_CARD_COLOR ? "default" : initial.profileCardColor.startsWith("linear-gradient(") ? "gradient" : "solid");
  const [profileCardColors, setProfileCardColors] = useState(() => readProfileCardColors(initial.profileCardColor));
  const [activeColorStop, setActiveColorStop] = useState(0);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(initial.avatarUrl ?? "");
  const [bannerPreview, setBannerPreview] = useState(initial.bannerUrl ?? "");
  const [activityBannerFile, setActivityBannerFile] = useState<File | null>(null);
  const [removeActivityBanner, setRemoveActivityBanner] = useState(false);
  const [activityBannerPreview, setActivityBannerPreview] = useState(initial.activityBannerUrl ?? "");
  const [memberListBannerFile, setMemberListBannerFile] = useState<File | null>(null);
  const [removeMemberListBanner, setRemoveMemberListBanner] = useState(false);
  const [memberListBannerPreview, setMemberListBannerPreview] = useState(initial.memberListBannerUrl ?? "");
  const [avatarCrop, setAvatarCrop] = useState<ImageCrop>({ x: initial.avatarPositionX ?? 50, y: initial.avatarPositionY ?? 50, zoom: initial.avatarZoom ?? 100 });
  const [bannerCrop, setBannerCrop] = useState<ImageCrop>({ x: initial.bannerPositionX ?? 50, y: initial.bannerPositionY ?? 50, zoom: initial.bannerZoom ?? 100 });
  const [memberListBannerCrop, setMemberListBannerCrop] = useState<ImageCrop>({ x: initial.memberListBannerPositionX ?? 50, y: initial.memberListBannerPositionY ?? 50, zoom: initial.memberListBannerZoom ?? 100 });
  const [serverDisplayName, setServerDisplayName] = useState(initial.displayName);
  const [serverAvatarFile, setServerAvatarFile] = useState<File | null>(null);
  const [serverBannerFile, setServerBannerFile] = useState<File | null>(null);
  const [serverMemberListBannerFile, setServerMemberListBannerFile] = useState<File | null>(null);
  const [serverAvatarPreview, setServerAvatarPreview] = useState("");
  const [serverBannerPreview, setServerBannerPreview] = useState("");
  const [serverMemberListBannerPreview, setServerMemberListBannerPreview] = useState("");
  const [serverAvatarCrop, setServerAvatarCrop] = useState<ImageCrop>(DEFAULT_CROP);
  const [serverBannerCrop, setServerBannerCrop] = useState<ImageCrop>(DEFAULT_CROP);
  const [serverMemberListBannerCrop, setServerMemberListBannerCrop] = useState<ImageCrop>(DEFAULT_CROP);
  const [serverProfileLoadError, setServerProfileLoadError] = useState("");
  const [imagePicker, setImagePicker] = useState<{ kind: ProfileImageKind; scope: ImageScope } | null>(null);
  const activityBannerInput = useRef<HTMLInputElement>(null);
  const [imageEditor, setImageEditor] = useState<ImageEditorTarget | null>(null);
  const [recentImages, setRecentImages] = useState<string[]>([]);
  const temporaryImageUrls = useRef(new Set<string>());
  const [removeServerAvatar, setRemoveServerAvatar] = useState(false);
  const [removeServerBanner, setRemoveServerBanner] = useState(false);
  const [removeServerMemberListBanner, setRemoveServerMemberListBanner] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const preferencesHydrated = useRef(false);
  const [email, setEmail] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetCaptchaToken, setResetCaptchaToken] = useState("");
  const [resetCaptchaKey, setResetCaptchaKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isBadgeManager, setIsBadgeManager] = useState(false);
  const [badgeDefinitions, setBadgeDefinitions] = useState<CustomBadge[]>([]);
  const [badgeAssignments, setBadgeAssignments] = useState<Record<string, string[]>>({});
  const [badgeMemberListVisibility, setBadgeMemberListVisibility] = useState<Record<string, Record<string, boolean>>>({});
  const [badgeProfileVisibility, setBadgeProfileVisibility] = useState<Record<string, boolean>>({});
  const [badgeUsers, setBadgeUsers] = useState<BadgeTargetUser[]>([]);
  const [badgeTargetUser, setBadgeTargetUser] = useState(userId);
  const [badgeName, setBadgeName] = useState("");
  const [badgeIcon, setBadgeIcon] = useState("✦");
  // Mantido para compatibilidade com a coluna obrigatória do banco; a interface da insígnia é transparente.
  const badgeBackground = "#202127";
  const [badgeForeground, setBadgeForeground] = useState("#ffffff");
  const [badgeImageFile, setBadgeImageFile] = useState<File | null>(null);
  const [badgeImagePreview, setBadgeImagePreview] = useState("");
  const [badgeLoading, setBadgeLoading] = useState(false);
  const [badgeSaving, setBadgeSaving] = useState(false);
  const [badgePendingDeleteId, setBadgePendingDeleteId] = useState<string | null>(null);
  const [badgeEditingId, setBadgeEditingId] = useState<string | null>(null);
  const [badgeEditName, setBadgeEditName] = useState("");
  const [badgeEditIcon, setBadgeEditIcon] = useState("");
  const [badgeVisibilitySavingId, setBadgeVisibilitySavingId] = useState<string | null>(null);
  const profileCardColor = profileCardMode === "default" ? null : profileCardMode === "gradient" && profileCardColors.length > 1
    ? `linear-gradient(135deg, ${profileCardColors.join(", ")})`
    : profileCardColors[0] ?? DEFAULT_PROFILE_CARD_COLOR;
  const profileCardPreviewColor = profileCardColor ?? DEFAULT_PROFILE_CARD_COLOR;
  const profileCardBaseColor = profileCardMode === "default" ? DEFAULT_PROFILE_CARD_COLOR : profileCardColors[0] ?? DEFAULT_PROFILE_CARD_COLOR;

  function updateActiveProfileCardColor(color: string) {
    setProfileCardColors((current) => current.map((value, index) => index === activeColorStop ? color : value));
  }

  function setProfileCardModeWithDefaults(mode: "default" | "solid" | "gradient") {
    setProfileCardMode(mode);
    setActiveColorStop(0);
    if (mode === "gradient" && profileCardColors.length === 1) {
      setProfileCardColors((current) => [...current, "#5865f2"]);
    }
  }

  function selectActivityBanner(file?: File) {
    if (!file) return;
    const format = profileImageUploadFormat(file);
    if (!format) { setError("Formato não suportado. Use PNG, JPG, WebP ou GIF."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("A imagem de fundo deve ter no máximo 8 MB."); return; }
    const previewUrl = URL.createObjectURL(file);
    temporaryImageUrls.current.add(previewUrl);
    setActivityBannerFile(file);
    setActivityBannerPreview(previewUrl);
    setRemoveActivityBanner(false);
    setError("");
  }

  useEffect(() => {
    preferencesHydrated.current = false;
    setPreferences(loadPreferences(userId));
    void supabase.auth.getUser().then(({ data }) => { const currentEmail = data.user?.email ?? ""; setEmail(currentEmail); setEmailDraft(currentEmail); });
  }, [supabase, userId]);

  useEffect(() => {
    setDesktopOverlayAvailable(Boolean(window.sekaiDesktop));
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.from("badge_managers").select("user_id").eq("user_id", userId).maybeSingle().then(({ data, error: managerError }) => {
      if (!active) return;
      setIsBadgeManager(Boolean(data));
      if (managerError) setError("Não foi possível verificar o acesso às insígnias. Confirme se a migração do Supabase foi executada.");
    });
    return () => { active = false; };
  }, [supabase, userId]);

  useEffect(() => {
    if (!isBadgeManager) return;
    let active = true;
    setBadgeLoading(true);
    void Promise.all([
      supabase.from("custom_badges").select("id, name, icon, background_color, foreground_color, image_url").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, username, display_name, show_badges_in_member_list").order("username", { ascending: true }),
      supabase.from("user_badges").select("user_id, badge_id, visible_in_member_list"),
    ]).then(([definitionsResult, usersResult, assignmentsResult]) => {
      if (!active) return;
      if (definitionsResult.error) setError("Não foi possível carregar as insígnias: " + definitionsResult.error.message);
      if (usersResult.error) setError("Não foi possível carregar os membros: " + usersResult.error.message);
      if (assignmentsResult.error) setError("Não foi possível carregar as atribuições: " + assignmentsResult.error.message);
      setBadgeDefinitions((definitionsResult.data ?? []).map((badge: any) => ({
        id: badge.id,
        name: badge.name,
        icon: badge.icon,
        backgroundColor: badge.background_color,
        foregroundColor: badge.foreground_color,
        imageUrl: badge.image_url,
      })));
      const assignments: Record<string, string[]> = {};
      const visibility: Record<string, Record<string, boolean>> = {};
      for (const row of assignmentsResult.data ?? []) {
        assignments[row.user_id] = [...(assignments[row.user_id] ?? []), row.badge_id];
        visibility[row.user_id] = { ...(visibility[row.user_id] ?? {}), [row.badge_id]: row.visible_in_member_list !== false };
      }
      setBadgeUsers((usersResult.data ?? []).map((profile: any) => ({
        id: profile.id,
        displayName: profile.display_name || profile.username || profile.id,
        username: profile.username,
      })));
      setBadgeProfileVisibility(Object.fromEntries((usersResult.data ?? []).map((profile: any) => [profile.id, profile.show_badges_in_member_list !== false])));
      setBadgeAssignments(assignments);
      setBadgeMemberListVisibility(visibility);
      setBadgeLoading(false);
    });
    return () => { active = false; };
  }, [isBadgeManager, supabase]);

  useEffect(() => {
    if (!serverId) return;
    let active = true;
    setServerProfileLoadError("");
    void supabase.from("members").select("nickname,avatar_url,avatar_position_x,avatar_position_y,avatar_zoom,banner_url,banner_position_x,banner_position_y,banner_zoom,member_list_banner_url,member_list_banner_position_x,member_list_banner_position_y,member_list_banner_zoom").eq("server_id", serverId).eq("user_id", userId).maybeSingle().then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) {
        setServerProfileLoadError("Não foi possível carregar a personalização por servidor. Aplique db/server_member_profile_migration.sql no Supabase e tente novamente.");
        return;
      }
      if (!data) return;
      setServerDisplayName(data.nickname ?? initial.displayName);
      setServerAvatarPreview(data.avatar_url ?? "");
      setServerBannerPreview(data.banner_url ?? "");
      setServerMemberListBannerPreview(data.member_list_banner_url ?? "");
      setServerAvatarCrop({ x: data.avatar_position_x ?? 50, y: data.avatar_position_y ?? 50, zoom: data.avatar_zoom ?? 100 });
      setServerBannerCrop({ x: data.banner_position_x ?? 50, y: data.banner_position_y ?? 50, zoom: data.banner_zoom ?? 100 });
      setServerMemberListBannerCrop({ x: data.member_list_banner_position_x ?? 50, y: data.member_list_banner_position_y ?? 50, zoom: data.member_list_banner_zoom ?? 100 });
    });
    return () => { active = false; };
  }, [initial.displayName, serverId, supabase, userId]);

  useEffect(() => {
    if (!preferencesHydrated.current) {
      preferencesHydrated.current = true;
      return;
    }
    document.documentElement.dataset.density = preferences.density;
    document.documentElement.dataset.fontScale = preferences.fontScale;
    document.documentElement.dataset.reducedMotion = String(preferences.reducedMotion);
    try {
      localStorage.setItem(`sekai-preferences:${userId}`, JSON.stringify(preferences));
      window.dispatchEvent(new Event(CHAT_PREFERENCES_EVENT));
    } catch { /* Preferências valem até fechar a página. */ }
  }, [preferences, userId]);

  useEffect(() => () => {
    if (badgeImagePreview.startsWith("blob:")) URL.revokeObjectURL(badgeImagePreview);
  }, [badgeImagePreview]);

  useEffect(() => () => {
    temporaryImageUrls.current.forEach((url) => URL.revokeObjectURL(url));
    temporaryImageUrls.current.clear();
  }, []);

  useEffect(() => {
    if (!imagePicker) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`sekai-recent-profile-images:${userId}:${imagePicker.kind}`) || "[]");
      setRecentImages(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string" && /^https?:\/\//i.test(item)).slice(0, 6) : []);
    } catch { setRecentImages([]); }
  }, [imagePicker, userId]);

  const { closing, requestClose } = useAnimatedClose(onClose);
  useEscapeKey(requestClose, !saving);

  const visibleNavigation = useMemo(() => NAV.filter((item) => {
    if (item.id === "insignias" && !isBadgeManager) return false;
    if (item.id === "sobreposicao" && !desktopOverlayAvailable) return false;
    if (item.id === "jogos" && !desktopOverlayAvailable) return false;
    return true;
  }), [desktopOverlayAvailable, isBadgeManager]);
  const currentSection = useMemo(() => visibleNavigation.find((item) => item.id === section) ?? visibleNavigation[0], [section, visibleNavigation]);

  useEffect(() => {
    if (!isBadgeManager && section === "insignias") setSection("perfil");
  }, [isBadgeManager, section]);

  useEffect(() => {
    if (!desktopOverlayAvailable && (section === "sobreposicao" || section === "jogos")) setSection("perfil");
  }, [desktopOverlayAvailable, section]);

  function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  function setChat<K extends keyof ChatDisplayPreferences>(key: K, value: ChatDisplayPreferences[K]) {
    setPreferences((current) => ({ ...current, chat: { ...current.chat, [key]: value } }));
  }

  function getImageCrop(kind: ProfileImageKind, scope: ImageScope) {
    if (scope === "server") return kind === "avatar" ? serverAvatarCrop : kind === "memberListBanner" ? serverMemberListBannerCrop : serverBannerCrop;
    return kind === "avatar" ? avatarCrop : kind === "memberListBanner" ? memberListBannerCrop : bannerCrop;
  }

  function setImageCrop(kind: ProfileImageKind, scope: ImageScope, crop: ImageCrop) {
    if (scope === "server") {
      if (kind === "avatar") setServerAvatarCrop(crop); else if (kind === "memberListBanner") setServerMemberListBannerCrop(crop); else setServerBannerCrop(crop);
    } else if (kind === "avatar") setAvatarCrop(crop); else if (kind === "memberListBanner") setMemberListBannerCrop(crop); else setBannerCrop(crop);
  }

  function setImageSelection(kind: ProfileImageKind, scope: ImageScope, file: File | null, url: string) {
    if (scope === "server") {
      if (kind === "avatar") { setServerAvatarFile(file); setServerAvatarPreview(url); setRemoveServerAvatar(false); }
      else if (kind === "memberListBanner") { setServerMemberListBannerFile(file); setServerMemberListBannerPreview(url); setRemoveServerMemberListBanner(false); }
      else { setServerBannerFile(file); setServerBannerPreview(url); setRemoveServerBanner(false); }
    } else if (kind === "avatar") { setAvatarFile(file); setAvatarPreview(url); setRemoveAvatar(false); }
    else if (kind === "memberListBanner") { setMemberListBannerFile(file); setMemberListBannerPreview(url); setRemoveMemberListBanner(false); }
    else { setBannerFile(file); setBannerPreview(url); setRemoveBanner(false); }
  }

  function openImagePicker(kind: ProfileImageKind) {
    setError("");
    setImagePicker({ kind, scope: profileScope });
  }

  function selectProfileMedia(selection: SelectedProfileMedia) {
    const target = imagePicker;
    if (!target) return;
    const { file } = selection;
    if (file && file.type && !file.type.startsWith("image/")) { setError("Escolha um arquivo de imagem."); return; }
    if (file && file.size > 8 * 1024 * 1024) { setError("A imagem deve ter no máximo 8 MB."); return; }
    const src = file ? URL.createObjectURL(file) : selection.url;
    if (file) temporaryImageUrls.current.add(src);
    if (!src) return;
    const previousUrl = target.scope === "server"
      ? target.kind === "avatar" ? serverAvatarPreview : target.kind === "memberListBanner" ? serverMemberListBannerPreview : serverBannerPreview
      : target.kind === "avatar" ? avatarPreview : target.kind === "memberListBanner" ? memberListBannerPreview : bannerPreview;
    const crop = src === previousUrl ? getImageCrop(target.kind, target.scope) : DEFAULT_CROP;
    setImagePicker(null);
    setImageEditor({ ...target, src, file, crop, pending: true });
  }

  function openCropEditor(kind: ProfileImageKind, scope: ImageScope) {
    const src = scope === "server"
      ? kind === "avatar" ? serverAvatarPreview : kind === "memberListBanner" ? serverMemberListBannerPreview : serverBannerPreview
      : kind === "avatar" ? avatarPreview : kind === "memberListBanner" ? memberListBannerPreview : bannerPreview;
    if (!src) return;
    const file = scope === "server" ? kind === "avatar" ? serverAvatarFile : kind === "memberListBanner" ? serverMemberListBannerFile : serverBannerFile : kind === "avatar" ? avatarFile : kind === "memberListBanner" ? memberListBannerFile : bannerFile;
    setImageEditor({ kind, scope, src, file, crop: getImageCrop(kind, scope), pending: false });
  }

  function closeCropEditor() {
    if (imageEditor?.pending && imageEditor.src.startsWith("blob:")) {
      URL.revokeObjectURL(imageEditor.src);
      temporaryImageUrls.current.delete(imageEditor.src);
    }
    setImageEditor(null);
  }

  function applyCrop(crop: ImageCrop) {
    if (!imageEditor) return;
    setImageSelection(imageEditor.kind, imageEditor.scope, imageEditor.file, imageEditor.src);
    setImageCrop(imageEditor.kind, imageEditor.scope, crop);
    setImageEditor(null);
  }

  function rememberRecentImage(kind: ProfileImageKind, url: string | null) {
    if (!url) return;
    try {
      const key = `sekai-recent-profile-images:${userId}:${kind}`;
      const previous = JSON.parse(localStorage.getItem(key) || "[]");
      const next = [url, ...(Array.isArray(previous) ? previous.filter((item) => item !== url) : [])].slice(0, 6);
      localStorage.setItem(key, JSON.stringify(next));
    } catch { /* Falha ao salvar recentes não impede salvar o perfil. */ }
  }

  function handleBadgeImagePick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Escolha uma imagem para o ícone da insígnia."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("A imagem da insígnia deve ter no máximo 8 MB."); return; }
    setError("");
    setBadgeImageFile(file);
    setBadgeImagePreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (section === "insignias") return;
    if (section === "perfil" && profileScope === "server") {
      if (!serverId) return;
      if (!serverDisplayName.trim()) { setError("Informe um nome para este perfil de servidor."); return; }
      setSaving(true); setError(""); setNotice("");
      let avatarUrl = removeServerAvatar ? null : serverAvatarPreview || null;
      let bannerUrl = removeServerBanner ? null : serverBannerPreview || null;
      let memberListBannerUrl = removeServerMemberListBanner ? null : serverMemberListBannerPreview || null;
      const nextAvatarCrop = removeServerAvatar ? DEFAULT_CROP : serverAvatarCrop;
      const nextBannerCrop = removeServerBanner ? DEFAULT_CROP : serverBannerCrop;
      const nextMemberListBannerCrop = removeServerMemberListBanner ? DEFAULT_CROP : serverMemberListBannerCrop;
      for (const item of [{ file: serverAvatarFile, kind: "avatar" as const }, { file: serverBannerFile, kind: "banner" as const }, { file: serverMemberListBannerFile, kind: "memberListBanner" as const }]) {
        if (!item.file) continue;
        const format = profileImageUploadFormat(item.file);
        if (!format) { setSaving(false); setError("Formato de imagem não suportado. Use PNG, JPG, WebP ou GIF."); return; }
        const path = `${userId}/server-profiles/${serverId}/${item.kind}-${crypto.randomUUID()}.${format.extension}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, item.file, { upsert: false, contentType: format.contentType });
        if (uploadError) { setSaving(false); setError(`Falha ao enviar ${item.kind === "avatar" ? "avatar" : item.kind === "memberListBanner" ? "banner da lista" : "banner"}: ${uploadError.message}`); return; }
        const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
        if (item.kind === "avatar") avatarUrl = url; else if (item.kind === "memberListBanner") memberListBannerUrl = url; else bannerUrl = url;
      }
      const { data: updatedMember, error: serverUpdateError } = await supabase.from("members").update({ nickname: serverDisplayName.trim(), avatar_url: avatarUrl, avatar_position_x: nextAvatarCrop.x, avatar_position_y: nextAvatarCrop.y, avatar_zoom: nextAvatarCrop.zoom, banner_url: bannerUrl, banner_position_x: nextBannerCrop.x, banner_position_y: nextBannerCrop.y, banner_zoom: nextBannerCrop.zoom, member_list_banner_url: memberListBannerUrl, member_list_banner_position_x: nextMemberListBannerCrop.x, member_list_banner_position_y: nextMemberListBannerCrop.y, member_list_banner_zoom: nextMemberListBannerCrop.zoom }).eq("server_id", serverId).eq("user_id", userId).select("user_id").maybeSingle();
      setSaving(false);
      if (serverUpdateError) { setError("Falha ao salvar perfil do servidor: " + serverUpdateError.message); return; }
      if (!updatedMember) { setError("Não foi possível localizar sua participação neste servidor para salvar o perfil."); return; }
      rememberRecentImage("avatar", avatarUrl); rememberRecentImage("banner", bannerUrl); rememberRecentImage("memberListBanner", memberListBannerUrl);
      onSaved(); requestClose(); return;
    }
    if (!displayName.trim()) { setError("Informe um nome de exibição."); setSection("perfil"); return; }
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username.trim())) { setError("O nome de usuário deve ter de 2 a 32 caracteres: letras, números, ponto, hífen ou sublinhado."); setSection("perfil"); return; }
    setSaving(true); setError(""); setNotice("");
    let avatarUrl = removeAvatar ? null : (avatarPreview || initial.avatarUrl || null);
    let bannerUrl = removeBanner ? null : (bannerPreview || initial.bannerUrl || null);
    let activityBannerUrl = removeActivityBanner ? null : (activityBannerPreview || initial.activityBannerUrl || null);
    let memberListBannerUrl = removeMemberListBanner ? null : (memberListBannerPreview || initial.memberListBannerUrl || null);

    for (const item of [{ file: avatarFile, kind: "avatar" as const }, { file: bannerFile, kind: "banner" as const }, { file: memberListBannerFile, kind: "memberListBanner" as const }]) {
      if (!item.file) continue;
      const format = profileImageUploadFormat(item.file);
      if (!format) { setSaving(false); setError("Formato de imagem não suportado. Use PNG, JPG, WebP ou GIF."); return; }
      const path = `${userId}/${item.kind}-${crypto.randomUUID()}.${format.extension}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, item.file, { upsert: false, contentType: format.contentType });
      if (uploadError) { setSaving(false); setError(`Falha ao enviar ${item.kind === "avatar" ? "avatar" : item.kind === "memberListBanner" ? "banner da lista" : "banner"}: ${uploadError.message}`); return; }
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      if (item.kind === "avatar") avatarUrl = url; else if (item.kind === "memberListBanner") memberListBannerUrl = url; else bannerUrl = url;
    }

    if (activityBannerFile) {
      const format = profileImageUploadFormat(activityBannerFile);
      if (!format) { setSaving(false); setError("Formato não suportado. Use PNG, JPG, WebP ou GIF."); return; }
      const path = `${userId}/activity-banner-${crypto.randomUUID()}.${format.extension}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, activityBannerFile, { upsert: false, contentType: format.contentType });
      if (uploadError) { setSaving(false); setError(`Falha ao enviar imagem de fundo: ${uploadError.message}`); return; }
      activityBannerUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const profileUpdate = {
      display_name: displayName.trim(), username: username.trim().toLowerCase(), pronouns: pronouns.trim() || null, bio: bio.trim() || null, custom_status: customStatus.trim() || null,
      avatar_url: avatarUrl,
      avatar_position_x: removeAvatar ? 50 : avatarCrop.x,
      avatar_position_y: removeAvatar ? 50 : avatarCrop.y,
      avatar_zoom: removeAvatar ? 100 : avatarCrop.zoom,
      banner_url: bannerUrl,
      banner_position_x: removeBanner ? 50 : bannerCrop.x,
      banner_position_y: removeBanner ? 50 : bannerCrop.y,
      banner_zoom: removeBanner ? 100 : bannerCrop.zoom,
      activity_banner_url: activityBannerUrl,
      member_list_banner_url: memberListBannerUrl,
      member_list_banner_position_x: removeMemberListBanner ? 50 : memberListBannerCrop.x,
      member_list_banner_position_y: removeMemberListBanner ? 50 : memberListBannerCrop.y,
      member_list_banner_zoom: removeMemberListBanner ? 100 : memberListBannerCrop.zoom,
      status: presence, profile_card_color: profileCardColor, show_badges_in_member_list: showBadgesInMemberList,
      profile_decoration: profileDecoration,
    };
    let { error: updateError } = await supabase.from("profiles").update(profileUpdate).eq("id", userId);
    if (updateError && isMissingProfileDecorationColumn(updateError)) {
      const { profile_decoration: omittedDecoration, ...withoutDecoration } = profileUpdate;
      void omittedDecoration;
      const retry = await supabase.from("profiles").update(withoutDecoration).eq("id", userId);
      updateError = retry.error;
      setSaving(false);
      if (updateError) { setError("Falha ao salvar: " + updateError.message); return; }
      setError("O perfil foi salvo, mas a decoração precisa da coluna nova. Aplique db/profile_decoration_migration.sql no Supabase e salve de novo.");
      onSaved();
      return;
    }
    setSaving(false);
    if (updateError) { setError("Falha ao salvar: " + updateError.message); return; }
    rememberRecentImage("avatar", avatarUrl); rememberRecentImage("banner", bannerUrl); rememberRecentImage("memberListBanner", memberListBannerUrl);
    onSaved(); requestClose();
  }

  async function createBadge() {
    const cleanName = badgeName.trim();
    const cleanIcon = badgeIcon.trim();
    if (!cleanName || cleanName.length > 32 || !cleanIcon || cleanIcon.length > 12) {
      setError("Informe um nome de até 32 caracteres e um emoji ou símbolo curto.");
      return;
    }
    setBadgeSaving(true); setError(""); setNotice("");
    let imageUrl: string | null = null;
    let imagePath: string | null = null;
    if (badgeImageFile) {
      const format = profileImageUploadFormat(badgeImageFile);
      if (!format) { setBadgeSaving(false); setError("Formato de imagem não suportado. Use PNG, JPG, WebP ou GIF."); return; }
      imagePath = `${userId}/badges/badge-${Date.now()}-${Math.random().toString(36).slice(2)}.${format.extension}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(imagePath, badgeImageFile, { contentType: format.contentType });
      if (uploadError) { setBadgeSaving(false); setError("Não foi possível enviar a arte da insígnia: " + uploadError.message); return; }
      imageUrl = supabase.storage.from("avatars").getPublicUrl(imagePath).data.publicUrl;
    }
    const { data, error: createError } = await supabase.from("custom_badges").insert({
      name: cleanName,
      icon: cleanIcon,
      background_color: badgeBackground,
      foreground_color: badgeForeground,
      image_url: imageUrl,
      image_path: imagePath,
      created_by: userId,
    }).select("id, name, icon, background_color, foreground_color, image_url").single();
    setBadgeSaving(false);
    if (createError) {
      if (imagePath) await supabase.storage.from("avatars").remove([imagePath]);
      setError("Não foi possível criar a insígnia: " + createError.message);
      return;
    }
    setBadgeDefinitions((current) => [{ id: data.id, name: data.name, icon: data.icon, backgroundColor: data.background_color, foregroundColor: data.foreground_color, imageUrl: data.image_url }, ...current]);
    setBadgeName("");
    setBadgeImageFile(null);
    setBadgeImagePreview("");
    setNotice("Insígnia criada. Agora você pode atribuí-la a alguém do servidor.");
  }

  async function toggleBadgeAssignment(badge: CustomBadge) {
    const assigned = (badgeAssignments[badgeTargetUser] ?? []).includes(badge.id);
    setBadgeSaving(true); setError(""); setNotice("");
    const result = assigned
      ? await supabase.from("user_badges").delete().eq("user_id", badgeTargetUser).eq("badge_id", badge.id)
      : await supabase.from("user_badges").insert({ user_id: badgeTargetUser, badge_id: badge.id, assigned_by: userId });
    setBadgeSaving(false);
    if (result.error) { setError("Não foi possível atualizar a insígnia: " + result.error.message); return; }
    setBadgeAssignments((current) => {
      const userBadges = new Set(current[badgeTargetUser] ?? []);
      if (assigned) userBadges.delete(badge.id); else userBadges.add(badge.id);
      return { ...current, [badgeTargetUser]: [...userBadges] };
    });
    setBadgeMemberListVisibility((current) => {
      const targetVisibility = { ...(current[badgeTargetUser] ?? {}) };
      if (assigned) delete targetVisibility[badge.id];
      else targetVisibility[badge.id] = true;
      return { ...current, [badgeTargetUser]: targetVisibility };
    });
    setNotice(assigned ? "Insígnia removida do perfil." : "Insígnia atribuída ao perfil.");
    onSaved();
  }

  function startBadgeNameEdit(badge: CustomBadge) {
    setBadgeEditingId(badge.id);
    setBadgeEditName(badge.name);
    setBadgeEditIcon(badge.icon);
    setError("");
    setNotice("");
  }

  async function saveBadgeName(badge: CustomBadge) {
    const name = badgeEditName.trim();
    const icon = badgeEditIcon.trim();
    if (!name || name.length > 32 || !icon || icon.length > 12) {
      setError("Informe um nome de até 32 caracteres e um símbolo ou rótulo curto de até 12 caracteres.");
      return;
    }
    if (name === badge.name && icon === badge.icon) {
      setBadgeEditingId(null);
      return;
    }
    setBadgeSaving(true); setError(""); setNotice("");
    const { data, error: updateError } = await supabase.from("custom_badges").update({ name, icon }).eq("id", badge.id).select("id, name, icon").maybeSingle();
    setBadgeSaving(false);
    if (updateError || !data) {
      setError("Não foi possível renomear a insígnia: " + (updateError?.message ?? "sem permissão para editar"));
      return;
    }
    setBadgeDefinitions((current) => current.map((item) => item.id === badge.id ? { ...item, name: data.name, icon: data.icon } : item));
    setBadgeEditingId(null);
    setNotice("Nome da insígnia atualizado.");
    onSaved();
  }

  async function toggleMemberListBadgeVisibility(badge: CustomBadge) {
    const visible = badge.visibleInMemberList === false;
    setBadgeVisibilitySavingId(badge.id); setError(""); setNotice("");
    const { data, error: visibilityError } = await supabase.from("user_badges").update({ visible_in_member_list: visible }).eq("user_id", userId).eq("badge_id", badge.id).select("badge_id").maybeSingle();
    setBadgeVisibilitySavingId(null);
    if (visibilityError || !data) {
      setError("Não foi possível atualizar a visibilidade da insígnia: " + (visibilityError?.message ?? "insígnia não encontrada"));
      return;
    }
    setProfileBadges((current) => current.map((item) => item.id === badge.id ? { ...item, visibleInMemberList: visible } : item));
    setBadgeMemberListVisibility((current) => ({ ...current, [userId]: { ...(current[userId] ?? {}), [badge.id]: visible } }));
    setNotice(visible ? "Insígnia exibida na lista de membros." : "Insígnia ocultada da lista de membros.");
    onSaved();
  }

  async function toggleManagedBadgeVisibility(badge: CustomBadge) {
    const visible = badgeMemberListVisibility[badgeTargetUser]?.[badge.id] === false;
    setBadgeVisibilitySavingId(badge.id); setError(""); setNotice("");
    const { data, error: visibilityError } = await supabase.from("user_badges").update({ visible_in_member_list: visible }).eq("user_id", badgeTargetUser).eq("badge_id", badge.id).select("badge_id").maybeSingle();
    setBadgeVisibilitySavingId(null);
    if (visibilityError || !data) {
      setError("Não foi possível atualizar a visibilidade da insígnia: " + (visibilityError?.message ?? "insígnia não encontrada"));
      return;
    }
    setBadgeMemberListVisibility((current) => ({ ...current, [badgeTargetUser]: { ...(current[badgeTargetUser] ?? {}), [badge.id]: visible } }));
    setNotice(visible ? "Insígnia exibida na lista de membros." : "Insígnia ocultada da lista de membros.");
    onSaved();
  }

  async function toggleManagedProfileBadgeVisibility() {
    const visible = badgeProfileVisibility[badgeTargetUser] === false;
    setBadgeVisibilitySavingId("profile"); setError(""); setNotice("");
    const { data, error: visibilityError } = await supabase.from("profiles").update({ show_badges_in_member_list: visible }).eq("id", badgeTargetUser).select("id").maybeSingle();
    setBadgeVisibilitySavingId(null);
    if (visibilityError || !data) {
      setError("Não foi possível atualizar a exibição das insígnias deste perfil: " + (visibilityError?.message ?? "perfil não encontrado"));
      return;
    }
    setBadgeProfileVisibility((current) => ({ ...current, [badgeTargetUser]: visible }));
    if (badgeTargetUser === userId) setShowBadgesInMemberList(visible);
    setNotice(visible ? "Insígnias ativadas na lista de membros." : "Insígnias ocultadas da lista de membros.");
    onSaved();
  }

  async function deleteBadge(badge: CustomBadge) {
    setBadgeSaving(true); setError(""); setNotice("");
    const { data: deletedBadge, error: deleteError } = await supabase.from("custom_badges").delete().eq("id", badge.id).select("image_path").single();
    setBadgeSaving(false);
    if (deleteError) { setError("Não foi possível excluir a insígnia: " + deleteError.message); return; }
    if (deletedBadge?.image_path) await supabase.storage.from("avatars").remove([deletedBadge.image_path]);
    setBadgeDefinitions((current) => current.filter((item) => item.id !== badge.id));
    setBadgeAssignments((current) => Object.fromEntries(Object.entries(current).map(([id, ids]) => [id, ids.filter((badgeId) => badgeId !== badge.id)])));
    setBadgePendingDeleteId(null);
    setNotice("Insígnia excluída.");
    onSaved();
  }

  async function sendPasswordReset() {
    if (!email) return;
    const parsedEmail = emailInputSchema.safeParse(email);
    if (!parsedEmail.success || !resetCaptchaToken) {
      setError("Informe um endereço válido e conclua a verificação anti-bot.");
      return;
    }
    setSendingReset(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/captcha-config", { cache: "no-store" });
      const config = response.ok ? await response.json() as { siteUrl?: string } : {};
      if (!config.siteUrl) throw new Error("missing_site_url");
      await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
        redirectTo: new URL("/auth/reset-password", config.siteUrl).toString(),
        captchaToken: resetCaptchaToken,
      });
      setNotice("Por segurança, não informamos se esse endereço possui uma conta. Se houver uma conta elegível, as instruções serão enviadas por e-mail.");
    } catch {
      setNotice("Por segurança, não informamos se esse endereço possui uma conta. Se houver uma conta elegível, as instruções serão enviadas por e-mail.");
    } finally {
      setSendingReset(false);
      setResetCaptchaToken("");
      setResetCaptchaKey((current) => current + 1);
    }
  }

  async function changeEmail() {
    if (!emailDraft.trim() || emailDraft.trim() === email) return;
    setSendingReset(true); setError(""); setNotice("");
    const { error: emailError } = await supabase.auth.updateUser({ email: emailDraft.trim() });
    setSendingReset(false);
    if (emailError) setError("Não foi possível atualizar o e-mail: " + emailError.message);
    else setNotice("Enviamos uma confirmação para o novo endereço de e-mail.");
  }

  async function handleLogout() {
    setError("");
    setNotice("");
    try {
      const { error: logoutError } = await supabase.auth.signOut({ scope: "local" });
      if (logoutError) setError("Não foi possível encerrar a sessão neste navegador. Tente novamente.");
    } catch {
      setError("Não foi possível encerrar a sessão neste navegador. Tente novamente.");
    }
  }

  return (
    <div className={cn("settings-backdrop-enter fixed inset-0 z-[100] flex items-stretch justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6", closing && "settings-backdrop-exit")} onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) requestClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="user-settings-title" className={cn("settings-window-enter flex h-[100dvh] max-h-[100dvh] w-full min-h-0 max-w-5xl overflow-hidden bg-discord-bg-secondary shadow-2xl sm:h-[min(900px,calc(100dvh-48px))] sm:max-h-[calc(100dvh-48px)] sm:rounded-2xl", closing && "settings-window-exit")}>
        <aside className="hidden min-h-0 w-60 shrink-0 flex-col overflow-y-auto border-r border-black/20 bg-discord-bg-primary p-4 sm:flex">
          <div className="mb-6 flex items-center gap-3 px-2 pt-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-theme-gradient text-white"><Settings2 size={18}/></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-discord-text-muted">Sekai</p><h2 id="user-settings-title" className="font-semibold text-discord-header-primary">Configurações</h2></div>
          </div>
          {(["Conta", "Aplicativo", "Jogos e apps", "Conexões", "Gestão"] as const).map((group) => {
            const items = visibleNavigation.filter((item) => item.group === group);
            if (!items.length) return null;
            return <div key={group} className="mb-5">
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-discord-text-muted">{group}</p>
              <div className="space-y-1">{items.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setSection(id); setError(""); setNotice(""); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${section === id ? "bg-discord-bg-modifier-hover text-discord-header-primary" : "text-discord-text-muted hover:bg-discord-bg-modifier-hover/60 hover:text-discord-text-normal"}`}><Icon size={17}/>{label}<ChevronRight size={14} className="ml-auto opacity-50"/></button>)}</div>
            </div>;
          })}
          <div className="mt-auto rounded-xl bg-discord-bg-secondary p-3">
            <div className="flex items-center gap-3"><div className="h-9 w-9 overflow-hidden rounded-full bg-theme-gradient">{avatarPreview && <img src={avatarPreview} alt="" className="h-full w-full object-cover"/>}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-discord-text-normal">{displayName || "Seu perfil"}</p><p className="truncate text-xs text-discord-text-muted">Personalize seu espaço</p></div></div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-black/15 px-5 py-4 sm:px-8">
            <div className="flex min-w-0 items-center gap-3"><select aria-label="Seção de configurações" value={section} onChange={(e) => setSection(e.target.value as Section)} className="max-w-[190px] rounded-lg bg-discord-bg-primary px-3 py-2 text-sm text-discord-text-normal sm:hidden">{visibleNavigation.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><div className="hidden items-center gap-2 sm:flex"><currentSection.icon size={18} className="text-discord-brand"/><h3 className="font-semibold text-discord-header-primary">{currentSection.label}</h3></div><span className="hidden text-sm text-discord-text-muted sm:inline">/</span><span className="hidden text-sm text-discord-text-muted sm:inline">Configurações de usuário</span></div>
            <button onClick={requestClose} aria-label="Fechar configurações" className="rounded-full p-2 text-discord-text-muted transition hover:bg-discord-bg-modifier-hover hover:text-white"><X size={19}/></button>
          </header>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-6 sm:px-9 sm:py-8">
            <div className="mx-auto max-w-2xl">
              {section === "perfil" && <section className="settings-section-enter">
                {serverId && <div className="settings-segment mb-6"><button type="button" aria-pressed={profileScope === "user"} onClick={() => setProfileScope("user")}>Perfil global</button><button type="button" aria-pressed={profileScope === "server"} onClick={() => setProfileScope("server")}>Neste servidor</button></div>}
                <div hidden={profileScope !== "user"}>
                <div className="mb-6"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-discord-brand">Identidade</p><h1 className="mt-1 text-[25px] font-bold leading-tight tracking-tight text-discord-header-primary">Seu perfil, do seu jeito</h1><p className="mt-2 max-w-xl text-sm leading-6 text-discord-text-muted">PNG, JPG ou GIF animado · até 8 MB · visível para a comunidade Sekai. Este é seu perfil global; você pode substituí-lo em um servidor específico.</p></div>
                <div className="settings-profile-preview relative mb-6 overflow-hidden rounded-2xl border shadow-lg shadow-black/10" style={{ background: profileCardPreviewColor, borderColor: "#08090b", transition: "background 180ms ease" }}>
                  <ProfileDecoration id={profileDecoration} />
                  <div className="relative aspect-[3.125/1] bg-theme-gradient">
                    {bannerPreview && <CroppedProfileImage src={bannerPreview} alt="" positionX={bannerCrop.x} positionY={bannerCrop.y} zoom={bannerCrop.zoom} pauseGif={false} className="pointer-events-none"/>}
                    <div className="absolute right-3 top-3 z-30 flex gap-2"><button type="button" onClick={() => openImagePicker("banner")} className="settings-upload-control flex items-center gap-2 rounded-lg bg-black/50 px-3 py-2 text-xs font-semibold text-white backdrop-blur"><ImagePlus size={15}/>{bannerPreview ? "Trocar banner" : "Adicionar banner"}</button>{bannerPreview && <><button type="button" onClick={() => openCropEditor("banner", "user")} className="rounded-lg bg-black/50 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/70">Ajustar recorte</button><button type="button" onClick={() => { setBannerFile(null); setBannerPreview(""); setBannerCrop(DEFAULT_CROP); setRemoveBanner(true); }} aria-label="Remover banner" className="rounded-lg bg-black/50 p-2 text-white backdrop-blur transition hover:bg-rose-500/80"><Trash2 size={15}/></button></>}</div>
                  </div>
                  <div className="relative z-10 flex flex-wrap items-end justify-between gap-3 px-5 pb-5">
                    <div className="flex min-w-0 items-end gap-3">
                      <div className="relative -mt-10 h-[84px] w-[84px] shrink-0 overflow-visible"><div className="relative h-full w-full rounded-full border-[5px] bg-discord-brand" style={{ borderColor: profileCardBaseColor }}><div className="absolute inset-0 overflow-hidden rounded-full">{avatarPreview ? <CroppedProfileImage src={avatarPreview} alt="Prévia do avatar" positionX={avatarCrop.x} positionY={avatarCrop.y} zoom={avatarCrop.zoom} className="rounded-full"/> : <div className="grid h-full place-items-center text-2xl font-bold text-white">{displayName[0]?.toUpperCase()}</div>}</div></div><PresenceIndicator presence={presence} avatarBadge borderColor={profileCardBaseColor} cutoutColor={profileCardBaseColor} /></div>
                      <div className="min-w-0 pb-1.5"><p className="max-w-[190px] truncate text-[15px] font-semibold tracking-tight text-discord-header-primary">{displayName || "Seu nome"}</p><p className="mt-0.5 max-w-[190px] truncate text-[11px] text-discord-text-muted">@{username || "seu_usuario"}{pronouns ? ` · ${pronouns}` : ""}</p>{customStatus ? <p className="mt-1 max-w-[190px] truncate text-[11px] text-discord-text-muted">{customStatus}</p> : <p className="mt-1 max-w-[190px] truncate text-[11px] italic text-discord-text-muted/70">Adicione um status</p>}</div>
                    </div>
                    <div className="mb-1 flex shrink-0 gap-2"><button type="button" onClick={() => openImagePicker("avatar")} className="settings-upload-control rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-xs font-semibold text-discord-text-normal">{avatarPreview ? "Trocar avatar" : "Adicionar avatar"}</button>{avatarPreview && <><button type="button" onClick={() => openCropEditor("avatar", "user")} className="rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-xs font-semibold text-discord-text-normal">Ajustar</button><button type="button" onClick={() => { setAvatarFile(null); setAvatarPreview(""); setAvatarCrop(DEFAULT_CROP); setRemoveAvatar(true); }} aria-label="Remover avatar" className="rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-discord-text-muted transition hover:bg-rose-500/20 hover:text-rose-300"><Trash2 size={14}/></button></>}</div>
                  </div>
                </div>
                <div className="mb-6 rounded-xl border border-white/5 bg-discord-bg-primary p-4">
                  <div className="mb-3"><h3 className="text-sm font-semibold text-discord-header-primary">Banner da lista de membros</h3><p className="mt-1 text-xs leading-5 text-discord-text-muted">A imagem começa invisível e fica sólida um pouco depois do nome, até 100% na direita.</p></div>
                  <MemberListBannerPreview src={memberListBannerPreview} name={displayName || "Seu nome"} positionX={memberListBannerCrop.x} positionY={memberListBannerCrop.y} zoom={memberListBannerCrop.zoom} playing />
                  <div className="flex flex-wrap gap-2"><button type="button" onClick={() => openImagePicker("memberListBanner")} className="settings-upload-control rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-xs font-semibold text-discord-text-normal">{memberListBannerPreview ? "Trocar banner da lista" : "Adicionar banner da lista"}</button>{memberListBannerPreview && <><button type="button" onClick={() => openCropEditor("memberListBanner", "user")} className="rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-xs font-semibold text-discord-text-normal">Ajustar recorte</button><button type="button" onClick={() => { setMemberListBannerFile(null); setMemberListBannerPreview(""); setMemberListBannerCrop(DEFAULT_CROP); setRemoveMemberListBanner(true); }} aria-label="Remover banner da lista de membros" className="rounded-lg bg-discord-bg-modifier-hover p-2 text-discord-text-muted transition hover:bg-rose-500/20 hover:text-rose-300"><Trash2 size={14}/></button></>}</div>
                </div>
                <div className="grid gap-x-5 gap-y-1 md:grid-cols-2">
                  <Field label="Nome de exibição" hint={`${displayName.length}/40`}><input value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} placeholder="Seu nome" className={inputClass}/></Field>
                  <Field label="Nome de usuário" hint={`@${username.length}/32`}><input value={username} maxLength={32} onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))} placeholder="seu_usuario" className={inputClass}/></Field>
                  <Field label="Pronomes" hint={`${pronouns.length}/32`}><input value={pronouns} maxLength={32} onChange={(e) => setPronouns(e.target.value)} placeholder="ela/dela, ele/dele..." className={inputClass}/></Field>
                  <Field label="Status personalizado" hint={`${customStatus.length}/128`}><input value={customStatus} maxLength={128} onChange={(e) => setCustomStatus(e.target.value)} placeholder="O que você está fazendo?" className={inputClass}/></Field>
                </div>
                <Field label="Sobre você" hint={`${bio.length}/190 caracteres`}><textarea value={bio} maxLength={190} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="Conte um pouco sobre você..." className={`${inputClass} resize-y`}/></Field>
                <div className="mb-5 rounded-xl border border-white/5 bg-discord-bg-primary p-4">
                  <div className="mb-3"><h4 className="text-sm font-semibold text-discord-header-primary">Decoração do perfil</h4><p className="mt-1 text-xs leading-5 text-discord-text-muted">A moldura acompanha a borda do cartão. Ela aparece no mini perfil, no perfil completo e na prévia acima.</p></div>
                  <ProfileDecorationPicker value={profileDecoration} onChange={setProfileDecoration} />
                </div>
                <div className="mb-5 rounded-xl border border-white/5 bg-discord-bg-primary p-4">
                  <div className="mb-3 flex items-center justify-between gap-3"><div><h4 className="text-sm font-semibold text-discord-header-primary">Cor do cartão de perfil</h4><p className="mt-1 text-xs leading-5 text-discord-text-muted">Escolha o padrão cinza, uma cor sólida ou um gradiente.</p></div><span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[11px] text-discord-text-muted"><i className="h-3 w-3 rounded-full border border-white/20" style={{ background: profileCardPreviewColor }}/>{profileCardMode === "default" ? "Padrão" : profileCardMode === "gradient" ? `Gradiente · ${profileCardColors.length} cores` : profileCardBaseColor.toUpperCase()}</span></div>
                  <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-discord-bg-secondary p-1">
                    <button type="button" onClick={() => setProfileCardModeWithDefaults("default")} aria-pressed={profileCardMode === "default"} className={`rounded-md px-3 py-2 text-xs font-semibold transition ${profileCardMode === "default" ? "bg-discord-bg-modifier-hover text-discord-header-primary" : "text-discord-text-muted hover:text-white"}`}>Padrão</button>
                    <button type="button" onClick={() => setProfileCardModeWithDefaults("solid")} aria-pressed={profileCardMode === "solid"} className={`rounded-md px-3 py-2 text-xs font-semibold transition ${profileCardMode === "solid" ? "bg-discord-bg-modifier-hover text-discord-header-primary" : "text-discord-text-muted hover:text-white"}`}>Cor sólida</button>
                    <button type="button" onClick={() => setProfileCardModeWithDefaults("gradient")} aria-pressed={profileCardMode === "gradient"} className={`rounded-md px-3 py-2 text-xs font-semibold transition ${profileCardMode === "gradient" ? "bg-discord-bg-modifier-hover text-discord-header-primary" : "text-discord-text-muted hover:text-white"}`}>Gradiente</button>
                  </div>
                  {profileCardMode === "gradient" && <div className="mb-3 flex flex-wrap items-center gap-2">
                    {profileCardColors.map((color, index) => <button key={index} type="button" onClick={() => setActiveColorStop(index)} aria-pressed={activeColorStop === index} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${activeColorStop === index ? "border-discord-brand bg-discord-brand/10 text-discord-header-primary" : "border-white/10 text-discord-text-muted hover:bg-white/5"}`}><i className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: color }}/>Cor {index + 1}</button>)}
                    {profileCardColors.length < 3 && <button type="button" onClick={() => { setProfileCardColors((current) => [...current, current.length === 1 ? "#5865f2" : "#20b8a6"]); setActiveColorStop(profileCardColors.length); }} className="rounded-lg border border-dashed border-white/20 px-2.5 py-1.5 text-xs text-discord-text-muted transition hover:border-white/40 hover:text-white">+ Adicionar cor</button>}
                    {profileCardColors.length > 2 && <button type="button" onClick={() => { setProfileCardColors((current) => current.slice(0, -1)); setActiveColorStop((current) => Math.min(current, profileCardColors.length - 2)); }} aria-label="Remover a última cor do gradiente" className="grid h-8 w-8 place-items-center rounded-lg text-discord-text-muted hover:bg-white/5 hover:text-white"><X size={14}/></button>}
                  </div>}
                  {profileCardMode !== "default" && <div className="flex flex-wrap items-center gap-2.5">
                    {PROFILE_CARD_COLORS.map((color) => <button key={color} type="button" aria-label={`Usar cor ${color} na cor ${activeColorStop + 1}`} aria-pressed={profileCardColors[activeColorStop]?.toLowerCase() === color} onClick={() => updateActiveProfileCardColor(color)} className={`h-9 w-9 rounded-full border transition ${profileCardColors[activeColorStop]?.toLowerCase() === color ? "scale-110 border-white ring-2 ring-discord-brand ring-offset-2 ring-offset-discord-bg-primary" : "border-white/15 hover:scale-105 hover:border-white/50"}`} style={{ backgroundColor: color }}/>) }
                    <label className="ml-1 flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-medium text-discord-text-normal transition hover:bg-discord-bg-modifier-hover">Personalizada<input aria-label={`Escolher cor ${activeColorStop + 1} personalizada do perfil`} type="color" value={profileCardColors[activeColorStop] ?? profileCardBaseColor} onChange={(event) => updateActiveProfileCardColor(event.target.value)} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"/></label>
                  </div>}
                </div>
                <div className="mb-5 rounded-xl border border-white/5 bg-discord-bg-primary p-4">
                  <div className="mb-3"><h4 className="text-sm font-semibold text-discord-header-primary">Imagem/GIF do painel de atividade</h4><p className="mt-1 text-xs leading-5 text-discord-text-muted">É independente do banner e da cor do cartão. Ela aparece no topo da área de atividade e desaparece em degradê. PNG, JPG, WebP ou GIF · até 8 MB.</p></div>
                  <div className="relative mb-3 h-24 overflow-hidden rounded-lg bg-discord-bg-secondary">
                    {activityBannerPreview && <div aria-hidden="true" className="absolute inset-0" style={{ maskImage: "linear-gradient(to bottom, black 0%, black 28%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 28%, transparent 100%)" }}><CroppedProfileImage src={activityBannerPreview} pauseGif={false} className="opacity-[.42] saturate-[.85]"/><div className="absolute inset-0 bg-gradient-to-b from-[#202127]/20 via-[#202127]/35 to-[#202127]"/></div>}
                    {!activityBannerPreview && <span className="absolute inset-0 grid place-items-center text-xs text-discord-text-muted">Prévia do fundo da atividade</span>}
                  </div>
                  <input ref={activityBannerInput} type="file" accept="image/gif,image/png,image/jpeg,image/webp" onChange={(event) => { selectActivityBanner(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} className="hidden"/>
                  <div className="flex flex-wrap gap-2"><button type="button" onClick={() => activityBannerInput.current?.click()} className="settings-upload-control inline-flex items-center gap-2 rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-xs font-semibold text-discord-text-normal"><ImagePlus size={14}/>{activityBannerPreview ? "Trocar imagem/GIF" : "Adicionar imagem/GIF"}</button>{activityBannerPreview && <button type="button" onClick={() => { setActivityBannerFile(null); setActivityBannerPreview(""); setRemoveActivityBanner(true); }} aria-label="Remover imagem/GIF do painel de atividade" className="rounded-lg bg-discord-bg-modifier-hover p-2 text-discord-text-muted transition hover:bg-rose-500/20 hover:text-rose-300"><Trash2 size={14}/></button>}</div>
                </div>
                <ToggleRow title="Mostrar insígnias na lista de membros" description="Ative para exibir as insígnias selecionadas abaixo, ao lado do seu nome." checked={showBadgesInMemberList} onChange={setShowBadgesInMemberList} />
                <div className="mt-5 rounded-xl border border-white/5 bg-discord-bg-primary p-4">
                  <div className="mb-3"><h4 className="text-sm font-semibold text-discord-header-primary">Insígnias na lista de membros</h4><p className="mt-1 text-xs leading-5 text-discord-text-muted">Escolha quais aparecem ao lado do seu nome na lista. Todas continuam aparecendo no mini perfil.</p></div>
                  {profileBadges.length === 0 ? <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-discord-text-muted">Você ainda não tem insígnias atribuídas.</p> : <div className="divide-y divide-white/5">{profileBadges.map((badge) => <div key={badge.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"><CustomBadgeList badges={[badge]} size="medium"/><span className="min-w-0 flex-1 truncate text-sm font-medium text-discord-text-normal">{badge.name}</span><ToggleRow title={`Mostrar ${badge.name}`} description="Exibir ao lado do nome na lista" checked={badge.visibleInMemberList !== false} disabled={badgeVisibilitySavingId === badge.id} onChange={() => void toggleMemberListBadgeVisibility(badge)} compact/></div>)}</div>}
                </div>
                <div className="mt-6 rounded-xl border border-white/5 bg-discord-bg-primary p-4"><div className="mb-3 flex items-center gap-2"><Circle size={10} className="fill-current text-discord-brand"/><h4 className="text-sm font-semibold text-discord-header-primary">Presença</h4></div><div className="grid gap-2 sm:grid-cols-2">{PRESENCE.map((item) => <button type="button" key={item.id} onClick={() => setPresence(item.id)} className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${presence === item.id ? "border-discord-brand bg-discord-brand/10" : "border-white/5 hover:bg-discord-bg-modifier-hover"}`}><span className="mt-0.5"><PresenceIndicator presence={item.id} size={16} cutoutColor="rgb(var(--d-primary))" hollowSymbols/></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-discord-text-normal">{item.label}</span><span className="mt-0.5 block text-xs text-discord-text-muted">{item.description}</span></span>{presence === item.id && <Check size={15} className="text-discord-brand"/>}</button>)}</div><p className="mt-2 text-[11px] text-discord-text-muted">A presença é exibida no perfil e na lista de membros.</p></div>
                </div>
                {serverId && <div hidden={profileScope !== "server"}>
                  <div className="mb-6"><p className="text-xs font-bold uppercase tracking-widest text-discord-brand">Personalização por servidor</p><h1 className="mt-1 text-2xl font-bold text-discord-header-primary">Seu perfil {serverName ? `em ${serverName}` : "neste servidor"}</h1><p className="mt-2 text-sm text-discord-text-muted">Use um nome, avatar ou banner diferente só aqui. O perfil global continua valendo nos outros servidores. GIF animado é aceito até 8 MB.</p></div>
                  {serverProfileLoadError && <p role="alert" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-5 text-amber-100">{serverProfileLoadError}</p>}
                  <div className="settings-profile-preview mb-6 overflow-hidden rounded-2xl border border-white/10 bg-discord-bg-primary shadow-lg shadow-black/10">
                    <div className="relative aspect-[3.125/1] bg-theme-gradient">
                      {serverBannerPreview && <CroppedProfileImage src={serverBannerPreview} alt="" positionX={serverBannerCrop.x} positionY={serverBannerCrop.y} zoom={serverBannerCrop.zoom} pauseGif={false} className="pointer-events-none"/>}
                      <div className="absolute right-3 top-3 z-30 flex gap-2"><button type="button" onClick={() => openImagePicker("banner")} className="settings-upload-control flex items-center gap-2 rounded-lg bg-black/50 px-3 py-2 text-xs font-semibold text-white"><ImagePlus size={15}/>{serverBannerPreview ? "Trocar banner" : "Adicionar banner"}</button>{serverBannerPreview && <><button type="button" onClick={() => openCropEditor("banner", "server")} className="rounded-lg bg-black/50 px-3 py-2 text-xs font-semibold text-white">Ajustar recorte</button><button type="button" onClick={() => { setServerBannerFile(null); setServerBannerPreview(""); setServerBannerCrop(DEFAULT_CROP); setRemoveServerBanner(true); }} aria-label="Remover banner do servidor" className="rounded-lg bg-black/50 p-2 text-white hover:bg-rose-500/80"><Trash2 size={15}/></button></>}</div>
                    </div>
                    <div className="relative z-10 flex flex-wrap items-end justify-between gap-3 px-5 pb-5">
                      <div className="flex min-w-0 items-end gap-3">
                        <div className="relative -mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-full border-[5px] border-discord-bg-primary bg-discord-brand shadow-lg transition-transform duration-200 hover:scale-[1.04]">{serverAvatarPreview ? <CroppedProfileImage src={serverAvatarPreview} alt="Avatar do servidor" positionX={serverAvatarCrop.x} positionY={serverAvatarCrop.y} zoom={serverAvatarCrop.zoom} className="profile-card-enter rounded-full"/> : <div className="grid h-full place-items-center text-2xl font-bold text-white">{serverDisplayName[0]?.toUpperCase()}</div>}</div>
                        <div className="min-w-0 pb-1.5"><p className="max-w-[190px] truncate text-[15px] font-semibold tracking-tight text-discord-header-primary">{serverDisplayName || "Seu nome"}</p><p className="mt-0.5 max-w-[190px] truncate text-[11px] text-discord-text-muted">Seu nome neste servidor</p></div>
                      </div>
                      <div className="mb-1 flex shrink-0 gap-2"><button type="button" onClick={() => openImagePicker("avatar")} className="settings-upload-control rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-xs font-semibold text-discord-text-normal">{serverAvatarPreview ? "Trocar avatar" : "Adicionar avatar"}</button>{serverAvatarPreview && <><button type="button" onClick={() => openCropEditor("avatar", "server")} className="rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-xs font-semibold text-discord-text-normal">Ajustar</button><button type="button" onClick={() => { setServerAvatarFile(null); setServerAvatarPreview(""); setServerAvatarCrop(DEFAULT_CROP); setRemoveServerAvatar(true); }} aria-label="Remover avatar do servidor" className="rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-xs text-discord-text-muted hover:text-rose-300"><Trash2 size={14}/></button></>}</div>
                    </div>
                  </div>
                  <div className="mb-6 rounded-xl border border-white/5 bg-discord-bg-primary p-4">
                    <div className="mb-3"><h3 className="text-sm font-semibold text-discord-header-primary">Banner da lista de membros</h3><p className="mt-1 text-xs leading-5 text-discord-text-muted">Personalização independente para este servidor, com o mesmo fade depois do nome.</p></div>
                    <MemberListBannerPreview src={serverMemberListBannerPreview} name={serverDisplayName || "Seu nome"} positionX={serverMemberListBannerCrop.x} positionY={serverMemberListBannerCrop.y} zoom={serverMemberListBannerCrop.zoom} playing />
                    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => openImagePicker("memberListBanner")} className="settings-upload-control rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-xs font-semibold text-discord-text-normal">{serverMemberListBannerPreview ? "Trocar banner da lista" : "Adicionar banner da lista"}</button>{serverMemberListBannerPreview && <><button type="button" onClick={() => openCropEditor("memberListBanner", "server")} className="rounded-lg bg-discord-bg-modifier-hover px-3 py-2 text-xs font-semibold text-discord-text-normal">Ajustar recorte</button><button type="button" onClick={() => { setServerMemberListBannerFile(null); setServerMemberListBannerPreview(""); setServerMemberListBannerCrop(DEFAULT_CROP); setRemoveServerMemberListBanner(true); }} aria-label="Remover banner da lista deste servidor" className="rounded-lg bg-discord-bg-modifier-hover p-2 text-discord-text-muted transition hover:bg-rose-500/20 hover:text-rose-300"><Trash2 size={14}/></button></>}</div>
                  </div>
                  <Field label="Nome neste servidor" hint={`${serverDisplayName.length}/32`}><input value={serverDisplayName} maxLength={32} onChange={(e) => setServerDisplayName(e.target.value)} placeholder="Nome de exibição" className={inputClass}/></Field>
                </div>}
              </section>}

              {section === "aparencia" && <section className="settings-section-enter">
                <SectionIntro eyebrow="Seu espaço" title="Aparência" text="Escolha cores e uma densidade de interface que combine com você. Temas secretos entram nesta lista quando são desbloqueados."/>
                <div className="mb-7"><h4 className="mb-3 text-sm font-semibold text-discord-header-primary">Tema de cores <span className="ml-1 font-normal text-discord-text-muted">{themes.find((item) => item.id === theme)?.name}</span></h4><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{themes.map((option) => <button key={option.id} type="button" onClick={() => setTheme(option.id)} className={`overflow-hidden rounded-xl border text-left transition ${theme === option.id ? "border-discord-brand ring-2 ring-discord-brand/30" : "border-white/10 hover:border-white/30"}`}><span className="relative block h-16" style={{ backgroundImage: `${option.overlay ? `url(/bankai/backgrounds/${option.overlay}.svg?v=2), ` : ""}linear-gradient(135deg, ${option.stops.join(", ")})`, backgroundSize: option.overlay ? "180px 180px, cover" : undefined }}>{theme === option.id && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/40"><Check size={14} className="text-white"/></span>}<span className="absolute inset-x-2 bottom-2 flex gap-1">{option.stops.slice(1, 5).map((color) => <i key={color} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: color }}/>)}</span></span><span className="block bg-discord-bg-primary px-3 py-2 text-xs font-semibold text-discord-text-normal">{option.name}{option.secret ? <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-discord-text-muted">Secreto</span> : null}</span></button>)}</div><p className="mt-2 text-xs text-discord-text-muted">O tema é salvo neste navegador. Temas secretos desenham o fundo do chat e aparecem aqui quando você os desbloqueia.</p></div>
                <PreferenceCard icon={Monitor} title="Densidade da interface" description="Escolha quanto espaço os elementos ocupam."><div className="grid grid-cols-2 gap-2">{([['comfortable', 'Confortável'], ['compact', 'Compacta']] as const).map(([value, label]) => <Choice key={value} active={preferences.density === value} onClick={() => setPreference("density", value)}>{label}</Choice>)}</div></PreferenceCard>
              </section>}

              {section === "voz" && <VoiceSettingsPanel userId={userId} />}
              {section === "sobreposicao" && desktopOverlayAvailable && <OverlaySettingsPanel />}
              {section === "jogos" && desktopOverlayAvailable && <RegisteredGamesSettingsPanel />}

              {section === "insignias" && isBadgeManager && <section className="settings-section-enter">
                <SectionIntro eyebrow="Personalização da comunidade" title="Insígnias" text="Crie símbolos exclusivos e escolha quais membros podem exibi-los ao lado do nome."/>
                <div className="mb-6 rounded-2xl border border-white/5 bg-discord-bg-primary p-4 sm:p-5">
                  <div className="mb-4 flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-discord-brand/15 text-discord-brand"><Award size={19}/></div><div><h3 className="font-semibold text-discord-header-primary">Nova insígnia</h3><p className="mt-1 text-xs leading-5 text-discord-text-muted">Use um emoji, símbolo ou caractere especial. O título aparece ao passar o cursor.</p></div></div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_90px]">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">Nome da insígnia<input value={badgeName} maxLength={32} onChange={(event) => setBadgeName(event.target.value)} placeholder="Ex.: Fundador" className={inputClass}/></label>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">Símbolo<input value={badgeIcon} maxLength={12} onChange={(event) => setBadgeIcon(event.target.value)} placeholder="✦" className={`${inputClass} text-center text-lg`}/></label>
                  </div>
                  <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">Arte personalizada opcional <span className="font-normal normal-case tracking-normal">(PNG, JPG ou GIF · até 8 MB)</span><input type="file" accept="image/gif,image/png,image/jpeg,image/webp" onChange={(event) => { handleBadgeImagePick(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} className="mt-2 block w-full cursor-pointer rounded-lg border border-white/5 bg-discord-bg-secondary px-3 py-2 text-xs text-discord-text-normal file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-discord-text-normal hover:file:bg-white/15"/></label>
                  {badgeImagePreview && <button type="button" onClick={() => { setBadgeImageFile(null); setBadgeImagePreview(""); }} className="mt-2 text-xs font-medium text-discord-text-muted transition hover:text-rose-300">Remover arte selecionada</button>}
                  <div className="mt-4 flex flex-wrap items-end gap-4">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">Símbolo<input aria-label="Cor do símbolo da insígnia" type="color" value={badgeForeground} onChange={(event) => setBadgeForeground(event.target.value)} className="mt-2 block h-10 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"/></label>
                    <div className="flex flex-1 items-center gap-2 pb-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">Prévia</span><CustomBadgeList badges={[{ id: "preview", name: badgeName.trim() || "Prévia", icon: badgeIcon.trim() || "✦", backgroundColor: badgeBackground, foregroundColor: badgeForeground, imageUrl: badgeImagePreview || null }]} size="medium"/></div>
                    <button type="button" onClick={() => void createBadge()} disabled={badgeSaving || !badgeName.trim()} className="inline-flex items-center gap-2 rounded-lg bg-theme-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/10 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50"><Plus size={16}/>{badgeSaving ? "Salvando..." : "Criar insígnia"}</button>
                  </div>
                </div>

                <div className="mb-4 rounded-2xl border border-white/5 bg-discord-bg-primary p-4 sm:p-5">
                  <label className="mb-4 block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted">Gerenciar perfil
                    <select value={badgeTargetUser} onChange={(event) => setBadgeTargetUser(event.target.value)} className={inputClass}>
                      <option value={userId}>Você</option>
                      {badgeUsers.filter((member) => member.id !== userId).map((member) => <option key={member.id} value={member.id}>{member.displayName} · @{member.username || member.id.slice(0, 8)}</option>)}
                    </select>
                  </label>
                  <ToggleRow title="Mostrar insígnias deste perfil na lista de membros" description="Controla a exibição geral; as opções individuais abaixo continuam salvas." checked={badgeProfileVisibility[badgeTargetUser] !== false} disabled={badgeVisibilitySavingId === "profile"} onChange={() => void toggleManagedProfileBadgeVisibility()} />
                  <h3 className="mb-3 text-sm font-semibold text-discord-header-primary">Insígnias criadas <span className="font-normal text-discord-text-muted">({badgeDefinitions.length})</span></h3>
                  {badgeLoading ? <p className="py-4 text-sm text-discord-text-muted">Carregando insígnias…</p> : badgeDefinitions.length === 0 ? <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-discord-text-muted">Ainda não há insígnias. Crie a primeira acima.</p> : <div className="space-y-2">{badgeDefinitions.map((badge) => {
                    const assigned = (badgeAssignments[badgeTargetUser] ?? []).includes(badge.id);
                    const visibleInMemberList = badgeMemberListVisibility[badgeTargetUser]?.[badge.id] !== false;
                    return <div key={badge.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-discord-bg-secondary/60 p-3 transition hover:border-white/10">
                      <CustomBadgeList badges={[badge]} size="medium"/>
                      <div className="min-w-0 flex-1">{badgeEditingId === badge.id ? <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto_auto] items-center gap-1.5"><input data-esc-local autoFocus value={badgeEditName} maxLength={32} onChange={(event) => setBadgeEditName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveBadgeName(badge); if (event.key === "Escape") { event.stopPropagation(); setBadgeEditingId(null); } }} aria-label={`Editar nome da insígnia ${badge.name}`} title="Nome mostrado ao passar o mouse" placeholder="Nome" className={`${inputClass} my-0 min-w-0 py-1.5 text-sm`}/><input data-esc-local value={badgeEditIcon} maxLength={12} onChange={(event) => setBadgeEditIcon(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveBadgeName(badge); if (event.key === "Escape") { event.stopPropagation(); setBadgeEditingId(null); } }} aria-label={`Editar símbolo ou rótulo de ${badge.name}`} title="Símbolo ou rótulo curto" placeholder="Símbolo" className={`${inputClass} my-0 min-w-0 px-2 py-1.5 text-center text-sm`}/><button type="button" onClick={() => void saveBadgeName(badge)} disabled={badgeSaving || !badgeEditName.trim() || !badgeEditIcon.trim()} aria-label="Salvar alterações da insígnia" className="rounded-lg p-2 text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-50"><Check size={16}/></button><button type="button" onClick={() => setBadgeEditingId(null)} disabled={badgeSaving} aria-label="Cancelar edição" className="rounded-lg p-2 text-discord-text-muted hover:bg-white/5"><X size={16}/></button></div> : <><p className="truncate text-sm font-semibold text-discord-text-normal">{badge.name}</p><p className={`text-[11px] ${badgePendingDeleteId === badge.id ? "text-rose-200" : "text-discord-text-muted"}`}>{badgePendingDeleteId === badge.id ? "Isso remove a insígnia de todos os perfis." : `${badge.icon} · ${assigned ? "atribuída" : "não atribuída"}`}</p></>}</div>
                      {badgeEditingId !== badge.id && <button type="button" onClick={() => startBadgeNameEdit(badge)} disabled={badgeSaving} aria-label={`Editar nome da insígnia ${badge.name}`} title="Editar nome" className="rounded-lg p-2 text-discord-text-muted transition hover:bg-white/5 hover:text-discord-text-normal disabled:opacity-50"><Pencil size={15}/></button>}
                      <button type="button" aria-pressed={assigned} onClick={() => void toggleBadgeAssignment(badge)} disabled={badgeSaving} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${assigned ? "bg-emerald-400/10 text-emerald-200 hover:bg-rose-400/10 hover:text-rose-200" : "bg-discord-bg-modifier-hover text-discord-text-normal hover:bg-discord-brand/20"}`}>{assigned ? "Atribuída" : "Atribuir"}</button>
                      <div className="flex items-center gap-2 rounded-lg bg-black/10 px-2.5 py-1.5">
                        <span className="text-[11px] text-discord-text-muted">Na lista</span>
                        <button type="button" role="switch" aria-checked={visibleInMemberList} aria-label={`Mostrar ${badge.name} na lista de membros`} title={assigned ? "Mostrar ao lado do nome na lista de membros" : "Atribua a insígnia primeiro"} disabled={!assigned || badgeVisibilitySavingId === badge.id} onClick={() => void toggleManagedBadgeVisibility(badge)} className={`relative h-5 w-9 shrink-0 rounded-full transition ${visibleInMemberList ? "bg-discord-brand" : "bg-white/15"} disabled:cursor-not-allowed disabled:opacity-40`}>
                          <span className={`absolute top-1 h-3 w-3 rounded-full bg-white transition ${visibleInMemberList ? "left-5" : "left-1"}`}/>
                        </button>
                      </div>
                      {badgePendingDeleteId === badge.id ? <div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => void deleteBadge(badge)} disabled={badgeSaving} className="rounded-lg bg-rose-500/15 px-2.5 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 disabled:opacity-50">Excluir</button><button type="button" onClick={() => setBadgePendingDeleteId(null)} disabled={badgeSaving} className="rounded-lg px-2.5 py-2 text-xs text-discord-text-muted hover:bg-white/5">Cancelar</button></div> : <button type="button" onClick={() => setBadgePendingDeleteId(badge.id)} disabled={badgeSaving} aria-label={`Excluir insígnia ${badge.name}`} title="Excluir para todos" className="rounded-lg p-2 text-discord-text-muted transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"><Trash2 size={15}/></button>}
                    </div>;
                  })}</div>}
                </div>
              </section>}

              {section === "mensagens" && <section className="settings-section-enter">
                <SectionIntro eyebrow="Exibição" title="Mensagens" text="Escolha o que aparece nas conversas dos servidores e nas mensagens diretas. A mudança vale neste navegador, na hora." />
                <p className="text-sm font-semibold text-discord-header-primary">Mostrar imagens, vídeos e memes…</p>
                <ToggleRow title="Quando publicados como links no chat." description="Incorpora GIF, imagem ou vídeo quando o endereço termina com a extensão do arquivo." checked={preferences.chat.embedLinkMedia} onChange={(value) => setChat("embedLinkMedia", value)} />
                <ToggleRow title="Quando o envio é feito diretamente no Sekai." description="Mostra as imagens anexadas pelo botão de envio." checked={preferences.chat.showUploads} onChange={(value) => setChat("showUploads", value)} />
                <ToggleRow title="Mostrar anexos e prévia de links" description="Carrega um cartão com título e imagem dos links https." checked={preferences.chat.showLinkPreviews} onChange={(value) => setChat("showLinkPreviews", value)} />
                <ToggleRow title="Mostrar reações de emoji" description="Exibe as reações abaixo de cada mensagem." checked={preferences.chat.showReactions} onChange={(value) => setChat("showReactions", value)} />
                <div className="flex items-center justify-between gap-4 border-b border-white/5 py-5">
                  <div>
                    <h4 className="text-sm font-semibold text-discord-header-primary">Mostrar spoilers</h4>
                    <p className="mt-1 text-xs text-discord-text-muted">O texto entre ||barras|| pode ficar oculto até o clique.</p>
                  </div>
                  <select aria-label="Como mostrar spoilers" value={preferences.chat.spoilerDisplay} onChange={(event) => setChat("spoilerDisplay", event.target.value === "always" ? "always" : "click")} className="rounded-lg border border-white/10 bg-discord-bg-primary px-3 py-2 text-sm text-discord-text-normal outline-none focus:border-discord-brand/70">
                    <option value="click">Ao clicar</option>
                    <option value="always">Sempre</option>
                  </select>
                </div>
                <ToggleRow title="Mostrar avatares dos usuários" description={preferences.density === "compact" ? "A densidade compacta oculta os avatares. Mude isso em Aparência." : "Mostra a foto de quem enviou a mensagem."} checked={preferences.density !== "compact" && preferences.chat.showAvatars} disabled={preferences.density === "compact"} onChange={(value) => setChat("showAvatars", value)} />
                <div className="mt-6">
                  <p className="mb-2 text-xs font-semibold text-discord-text-muted">Configurações relacionadas</p>
                  <button type="button" onClick={() => setSection("aparencia")} className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-discord-bg-primary p-3 text-left transition hover:bg-white/[0.03]">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-discord-text-normal"><Palette size={18} /></span>
                    <span className="min-w-0"><span className="block text-sm font-semibold text-discord-header-primary">Aparência</span><span className="mt-0.5 block text-xs leading-5 text-discord-text-muted">Selecione Compacta em Densidade da interface para ocultar os avatares.</span></span>
                    <ChevronRight size={16} className="ml-auto shrink-0 text-discord-text-muted" />
                  </button>
                </div>
                <div className="mt-8">
                  <h2 className="text-lg font-bold text-discord-header-primary">Caixa de chat</h2>
                  <ToggleRow title="Preveja emojis, menções e sintaxe de markdown enquanto digita" description="Mostra a mensagem formatada acima do campo, antes do envio." checked={preferences.chat.composerPreview} onChange={(value) => setChat("composerPreview", value)} />
                </div>
              </section>}

              {section === "conexoes" && <SpotifyConnections userId={userId} />}

              {section === "acessibilidade" && <section className="settings-section-enter">
                <SectionIntro eyebrow="Conforto" title="Acessibilidade" text="Ajuste leitura e movimento para tornar o Sekai mais confortável."/>
                <PreferenceCard icon={Accessibility} title="Tamanho do texto" description="Aumente o texto da interface sem alterar o conteúdo das mensagens."><div className="grid grid-cols-2 gap-2">{([['normal', 'Padrão'], ['large', 'Maior']] as const).map(([value, label]) => <Choice key={value} active={preferences.fontScale === value} onClick={() => setPreference("fontScale", value)}>{label}</Choice>)}</div></PreferenceCard>
                <ToggleRow title="Reduzir animações" description="Desativa transições e animações decorativas." checked={preferences.reducedMotion} onChange={(value) => setPreference("reducedMotion", value)}/>
                <div className="mt-5 flex items-start gap-3 rounded-xl bg-discord-bg-primary p-4 text-xs leading-5 text-discord-text-muted"><Eye size={17} className="mt-0.5 shrink-0 text-discord-brand"/>Essas preferências ficam salvas neste navegador e são aplicadas imediatamente.</div>
              </section>}

              {section === "privacidade" && <section className="settings-section-enter">
                <SectionIntro eyebrow="Visibilidade" title="Privacidade" text="Controle o que as outras pessoas conseguem ver sobre sua atividade."/>
                <div className="mb-5 rounded-xl border border-white/5 bg-discord-bg-primary p-4"><div className="mb-4 flex items-start gap-3"><Shield size={18} className="mt-0.5 text-discord-brand"/><div><h4 className="text-sm font-semibold text-discord-header-primary">Quem vê sua presença</h4><p className="mt-1 text-xs leading-5 text-discord-text-muted">Escolha como seu estado aparece para amigos e membros dos servidores.</p></div></div><div className="space-y-2">{PRESENCE.map((item) => <button key={item.id} onClick={() => setPresence(item.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${presence === item.id ? "bg-discord-brand/10" : "hover:bg-discord-bg-modifier-hover"}`}><PresenceIndicator presence={item.id} size={16} cutoutColor="rgb(var(--d-primary))" hollowSymbols/><span className="flex-1 text-sm text-discord-text-normal">{item.label}</span>{presence === item.id && <Check size={16} className="text-discord-brand"/>}</button>)}</div><p className="mt-3 text-[11px] text-discord-text-muted">A alteração será salva junto com seu perfil.</p></div>
                <div className="flex items-start gap-3 rounded-xl border border-white/5 p-4"><Eye size={17} className="mt-0.5 text-discord-text-muted"/><div><h4 className="text-sm font-semibold text-discord-header-primary">Perfil público</h4><p className="mt-1 text-xs leading-5 text-discord-text-muted">Nome, avatar, banner, status e bio ficam visíveis para usuários autenticados do Sekai.</p></div></div>
              </section>}

              {section === "conta" && <section className="settings-section-enter">
                <SectionIntro eyebrow="Acesso" title="Minha conta" text="Revise seus dados de acesso e proteja sua conta."/>
                <div className="mb-5 rounded-xl border border-white/5 bg-discord-bg-primary p-5"><div className="mb-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-discord-brand/15 text-discord-brand"><Bell size={19}/></div><div><h4 className="font-semibold text-discord-header-primary">E-mail da conta</h4><p className="text-xs text-discord-text-muted">O novo e-mail precisa ser confirmado.</p></div></div><div className="flex flex-wrap gap-2"><input type="email" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} placeholder="voce@exemplo.com" className={`${inputClass} mt-0 min-w-[180px] flex-1`}/><button onClick={() => void changeEmail()} disabled={!emailDraft.trim() || emailDraft.trim() === email || sendingReset} className="rounded-lg bg-discord-bg-modifier-hover px-4 py-2.5 text-sm font-semibold text-discord-text-normal transition hover:brightness-125 disabled:opacity-50">Atualizar e-mail</button></div><p className="mt-2 text-xs text-discord-text-muted">Atual: {email || "indisponível"}</p></div>
                <div className="mb-7 rounded-xl border border-white/5 p-5"><h4 className="font-semibold text-discord-header-primary">Senha</h4><p className="mt-1 text-sm text-discord-text-muted">Enviaremos um link seguro para redefinir sua senha.</p><TurnstileCaptcha resetKey={resetCaptchaKey} onToken={setResetCaptchaToken}/><button disabled={!email || sendingReset || !resetCaptchaToken} onClick={() => void sendPasswordReset()} className="mt-4 rounded-lg bg-discord-bg-modifier-hover px-4 py-2.5 text-sm font-semibold text-discord-text-normal transition hover:brightness-125 disabled:opacity-50">{sendingReset ? "Enviando..." : "Enviar link de redefinição"}</button></div>
                <MfaSettings />
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5"><h4 className="font-semibold text-rose-300">Sessão</h4><p className="mt-1 text-sm text-discord-text-muted">Encerre sua sessão neste dispositivo.</p><button onClick={() => void handleLogout()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-500/30 px-4 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10"><LogOut size={16}/>Sair da conta</button></div>
              </section>}
            </div>
          </div>

          {(error || notice) && <div className={`mx-5 mb-3 rounded-lg px-3 py-2 text-sm sm:mx-9 ${error ? "bg-discord-danger/10 text-discord-danger" : "bg-emerald-500/10 text-emerald-300"}`} role={error ? "alert" : "status"}>{error || notice}</div>}
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-black/15 bg-discord-bg-secondary px-5 py-4 sm:px-9"><p className="hidden text-xs text-discord-text-muted sm:block">{section === "insignias" ? "As atribuições são aplicadas imediatamente." : section === "mensagens" ? "A exibição do chat muda na hora, neste navegador." : section === "conexoes" ? "A conexão do Spotify fica neste navegador." : section === "voz" ? "As preferências de áudio são aplicadas imediatamente neste navegador." : section === "sobreposicao" || section === "jogos" ? "As opções são salvas neste aplicativo." : "As preferências de aparência são aplicadas na hora."}</p><div className="ml-auto flex gap-2"><button onClick={requestClose} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-discord-text-muted transition hover:bg-discord-bg-modifier-hover hover:text-white">Fechar</button>{section !== "insignias" && section !== "mensagens" && section !== "conexoes" && section !== "voz" && section !== "sobreposicao" && section !== "jogos" && <button onClick={() => void handleSave()} disabled={saving} className="rounded-lg bg-theme-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/10 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{saving ? "Salvando..." : section === "perfil" && profileScope === "server" ? "Salvar perfil do servidor" : "Salvar perfil"}</button>}</div></footer>
        </main>
      </div>
      {imagePicker && <ProfileImagePickerModal kind={imagePicker.kind} recentImages={recentImages} onSelect={selectProfileMedia} onClose={() => setImagePicker(null)}/>}
      {imageEditor && <ProfileImageCropModal kind={imageEditor.kind} src={imageEditor.src} initialCrop={imageEditor.crop} onApply={applyCrop} onClose={closeCropEditor}/>}
    </div>
  );
}

const inputClass = "mt-2 w-full rounded-lg border border-white/5 bg-discord-bg-primary px-3.5 py-3 text-sm text-discord-text-normal outline-none transition placeholder:text-discord-text-muted/60 focus:border-discord-brand/70 focus:ring-2 focus:ring-discord-brand/15";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="mb-4 block min-w-0"><span className="mb-1.5 flex min-h-4 items-center justify-between gap-2 text-[11px] font-semibold uppercase leading-none tracking-[.055em] text-discord-text-muted"><span className="min-w-0 truncate">{label}</span>{hint && <span className="shrink-0 whitespace-nowrap text-[10px] font-normal normal-case tracking-normal tabular-nums">{hint}</span>}</span>{children}</label>;
}

function SectionIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="mb-7"><p className="text-xs font-bold uppercase tracking-widest text-discord-brand">{eyebrow}</p><h1 className="mt-1 text-2xl font-bold text-discord-header-primary">{title}</h1><p className="mt-2 text-sm text-discord-text-muted">{text}</p></div>;
}

function PreferenceCard({ icon: Icon, title, description, children }: { icon: typeof Monitor; title: string; description: string; children: React.ReactNode }) {
  return <div className="mb-4 rounded-xl border border-white/5 bg-discord-bg-primary p-4"><div className="mb-4 flex items-start gap-3"><Icon size={18} className="mt-0.5 text-discord-brand"/><div><h4 className="text-sm font-semibold text-discord-header-primary">{title}</h4><p className="mt-1 text-xs text-discord-text-muted">{description}</p></div></div>{children}</div>;
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-lg border px-3 py-2.5 text-sm transition ${active ? "border-discord-brand bg-discord-brand/10 text-discord-text-normal" : "border-white/10 text-discord-text-muted hover:bg-discord-bg-modifier-hover"}`}>{children}</button>;
}

function ToggleRow({ title, description, checked, onChange, disabled = false, compact = false }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; compact?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 ${compact ? "py-0" : "border-b border-white/5 py-5"}`}><div className={compact ? "sr-only" : ""}><h4 className="text-sm font-semibold text-discord-header-primary">{title}</h4><p className="mt-1 text-xs text-discord-text-muted">{description}</p></div>{compact && <span className="whitespace-nowrap text-[11px] text-discord-text-muted">Na lista</span>}<button type="button" role="switch" aria-checked={checked} aria-label={title} disabled={disabled} onClick={() => { if (!disabled) onChange(!checked); }} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-discord-brand" : "bg-white/15"} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`}/></button></div>;
}
