"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import {
  getAppBottomNavIcon,
  getAppBottomNavShortLabel,
  splitAppBottomNavLinks,
  type AppBottomNavLink,
} from "../lib/appBottomNavLinks";
import { useAppBottomNavLinks } from "../lib/useAppBottomNavLinks";

const TEXT = "#F5F0E8";
const GOLD = "#D4A017";
const NAV_BG = "rgba(8, 8, 8, 0.97)";

type AppBottomNavProps = {
  session?: Session | null;
  memberType?: string | null;
  blockedHrefs?: Set<string>;
};

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({
  link,
  active,
  blocked,
  onNavigate,
}: {
  link: AppBottomNavLink;
  active: boolean;
  blocked?: boolean;
  onNavigate?: () => void;
}): JSX.Element {
  const style = {
    flex: "0 0 auto",
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.15rem",
    minHeight: "48px",
    minWidth: "48px",
    fontSize: "12px",
    lineHeight: 1.2,
    color: active ? GOLD : TEXT,
    opacity: blocked ? 0.35 : active ? 1 : 0.75,
    textDecoration: "none",
    padding: "0.25rem 0.45rem",
    whiteSpace: "nowrap",
    cursor: blocked ? "not-allowed" : "pointer",
    border: "none",
    background: "transparent",
    fontFamily: "inherit",
  } as const;

  const content = (
    <>
      <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
        {getAppBottomNavIcon(link.href)}
      </span>
      <span>{getAppBottomNavShortLabel(link)}</span>
    </>
  );

  if (blocked) {
    return (
      <span style={style} title="Accès suspendu (période de grâce)">
        {content}
      </span>
    );
  }

  return (
    <Link href={link.href} style={style} onClick={onNavigate}>
      {content}
    </Link>
  );
}

export function AppBottomNav({
  session,
  memberType,
  blockedHrefs,
}: AppBottomNavProps): JSX.Element {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = (): void => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const navLinks = useAppBottomNavLinks(session, memberType);
  const { primary, secondary } = useMemo(
    () => splitAppBottomNavLinks(navLinks),
    [navLinks],
  );

  /** Mobile : primary + menu Plus+ ; desktop : tous les liens à plat. */
  const barLinks = isMobile ? primary : navLinks;
  const showMoreMenu = isMobile && secondary.length > 0;

  const secondaryActive = useMemo(
    () => secondary.some((link) => isNavActive(pathname, link.href)),
    [pathname, secondary],
  );

  const updateScrollEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setScrollEdges({
      left: scrollLeft > 4,
      right: scrollLeft + clientWidth < scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    updateScrollEdges();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollEdges, { passive: true });
    const ro = new ResizeObserver(updateScrollEdges);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollEdges);
      ro.disconnect();
    };
  }, [updateScrollEdges, barLinks.length, showMoreMenu]);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent): void => {
      if (moreRef.current?.contains(event.target as Node)) return;
      setMoreOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [moreOpen]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobile) setMoreOpen(false);
  }, [isMobile]);

  const plusStyle = {
    flex: "0 0 auto",
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.15rem",
    minHeight: "48px",
    minWidth: "48px",
    fontSize: "12px",
    lineHeight: 1.2,
    color: moreOpen || secondaryActive ? GOLD : TEXT,
    opacity: moreOpen || secondaryActive ? 1 : 0.75,
    padding: "0.25rem 0.45rem",
    whiteSpace: "nowrap",
    cursor: "pointer",
    border: "none",
    background: "transparent",
    fontFamily: "inherit",
  } as const;

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: NAV_BG,
        borderTop: "1px solid rgba(245, 240, 232, 0.1)",
        padding: "0.35rem 0.35rem calc(0.35rem + env(safe-area-inset-bottom))",
        zIndex: 30,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "stretch",
          maxWidth: "960px",
          margin: "0 auto",
        }}
      >
        {scrollEdges.left ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "1.25rem",
              background: `linear-gradient(to right, ${NAV_BG}, transparent)`,
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
        ) : null}
        {scrollEdges.right ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              right: showMoreMenu ? "3.25rem" : 0,
              top: 0,
              bottom: 0,
              width: "1.25rem",
              background: `linear-gradient(to left, ${NAV_BG}, transparent)`,
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
        ) : null}

        <div
          ref={scrollRef}
          style={{
            display: "flex",
            overflowX: "auto",
            gap: "0.25rem",
            flex: 1,
            minWidth: 0,
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {barLinks.map((link) => (
            <NavItem
              key={link.href}
              link={link}
              active={isNavActive(pathname, link.href)}
              blocked={blockedHrefs?.has(link.href)}
            />
          ))}
        </div>

        {showMoreMenu ? (
          <div ref={moreRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-haspopup="true"
              style={plusStyle}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
                ➕
              </span>
              <span>Plus +</span>
            </button>

            {moreOpen ? (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 0.35rem)",
                  right: 0,
                  minWidth: "10.5rem",
                  background: "rgba(18, 18, 18, 0.98)",
                  border: "1px solid rgba(245, 240, 232, 0.12)",
                  borderRadius: "8px",
                  padding: "0.35rem",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
                  zIndex: 40,
                }}
              >
                {secondary.map((link) => {
                  const active = isNavActive(pathname, link.href);
                  const blocked = blockedHrefs?.has(link.href);
                  const itemStyle = {
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    minHeight: "48px",
                    padding: "0.45rem 0.65rem",
                    fontSize: "12px",
                    color: active ? GOLD : TEXT,
                    opacity: blocked ? 0.35 : active ? 1 : 0.85,
                    textDecoration: "none",
                    borderRadius: "6px",
                    cursor: blocked ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  } as const;

                  const label = (
                    <>
                      <span aria-hidden>{getAppBottomNavIcon(link.href)}</span>
                      <span>{getAppBottomNavShortLabel(link)}</span>
                    </>
                  );

                  if (blocked) {
                    return (
                      <span
                        key={link.href}
                        role="menuitem"
                        style={itemStyle}
                        title="Accès suspendu (période de grâce)"
                      >
                        {label}
                      </span>
                    );
                  }

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      role="menuitem"
                      style={itemStyle}
                      onClick={() => setMoreOpen(false)}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
