-- Desktop POS release registry.
-- The web admin (SUPER_ADMIN) manages versions; the desktop app and vendor
-- account owners fetch the latest PUBLISHED release to download / update.
--
-- All access goes through service-role API routes with app-level authz, so RLS
-- is enabled with NO policies (denies any direct anon/authenticated access; the
-- service role bypasses RLS).

CREATE TABLE IF NOT EXISTS "public"."desktop_releases" (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version       text NOT NULL,                       -- semver, e.g. 1.0.0
  channel       text NOT NULL DEFAULT 'stable',      -- stable | beta
  platform      text NOT NULL DEFAULT 'win',         -- win | mac | linux
  notes         text,                                -- release notes / changelog
  download_url  text,                                -- CloudFront URL to the installer (null until uploaded)
  file_name     text,
  file_size     bigint,
  sha256        text,
  mandatory     boolean NOT NULL DEFAULT false,      -- force update
  is_published  boolean NOT NULL DEFAULT false,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  CONSTRAINT desktop_releases_version_channel_platform_key UNIQUE (version, channel, platform)
);

CREATE INDEX IF NOT EXISTS desktop_releases_latest_idx
  ON public.desktop_releases (platform, channel, is_published, created_at DESC);

ALTER TABLE public.desktop_releases ENABLE ROW LEVEL SECURITY;
