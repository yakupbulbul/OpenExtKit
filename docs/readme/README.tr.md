# OpenExtKit

[![Lisans: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)
[![CI](https://github.com/yakupbulbul/OpenExtKit/actions/workflows/ci.yml/badge.svg)](https://github.com/yakupbulbul/OpenExtKit/actions/workflows/ci.yml)
[![Node >=20.11](https://img.shields.io/badge/node-%3E%3D20.11-brightgreen.svg)](../../package.json)
[![pnpm](https://img.shields.io/badge/pnpm-9.15.4-orange.svg)](../../package.json)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4.svg)](../browser-support.md)
[![MCP uyumlu](https://img.shields.io/badge/MCP-friendly-6f42c1.svg)](../mcp-tools.md)

Tek bir TypeScript kod tabanından tarayıcı uzantıları oluşturmak, test etmek, doğrulamak, paketlemek ve yayına hazırlamak için AI-native, çapraz tarayıcı uzantı geliştirme aracı.

**Diller:** [English](../../README.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md)

> Bu çeviri İngilizce README dosyasını takip eder. En güncel teknik ayrıntılar için İngilizce README kaynak kabul edilir.

## Proje Durumu

OpenExtKit yayın öncesi geliştirme aşamasındadır. CLI, paket sınırları ve herkese açık API'ler kararlı hale gelene kadar desteklenen kullanım yolu yerel workspace kullanımıdır. Depo açık kaynak katkılarına uygundur: issue, tartışma, dokümantasyon iyileştirmeleri, template fikirleri, tarayıcı uyumluluğu düzeltmeleri ve test katkıları memnuniyetle karşılanır.

Chrome, Edge ve Opera Chromium uyumlu Manifest V3 hedefleri olarak ele alınır. Firefox Manifest V3 desteği, hedefe özel uyumluluk raporlamasıyla birlikte temel iş akışının parçasıdır. Safari deneysel durumdadır ve tam store paketleme tamamlanmış gibi davranmak yerine macOS/Xcode gereksinimlerini açıkça raporlar.

## Neden OpenExtKit?

Tarayıcı uzantısı ekipleri manifestler, izinler, tarayıcı farkları, paketleme, görsel kontroller, yayın hazırlığı ve store metadata konularında aynı işleri tekrar tekrar yapar. OpenExtKit bu iş akışlarını açık, test edilebilir ve Codex, Claude Code, Cursor ve Windsurf gibi AI kodlama araçları için kullanılabilir hale getirir.

## Öne Çıkanlar

- Chrome, Edge, Opera, Firefox ve deneysel Safari için çapraz tarayıcı Manifest V3 üretimi.
- Init, build, dev, test, visual checks, packaging, diagnostics, release reports ve store asset preparation için TypeScript-first CLI.
- Chromium ailesi hedefler için gerçek tarayıcı iş akışları: interactive dev mode, visual screenshots, visual regression baselines, recording mode ve JSON E2E recipes.
- Store readiness scoring, permission risk advice, publish wizard reports ve yerel upload-ready submission assets.
- Diagnostics, testing, review, visual review, templates, packaging ve release tools içeren AI-agent iş akışları için MCP server.
- Starter projeler ve yerel preview gallery içeren template marketplace.
- Core config, manifests, browser APIs, testing, packaging, release, templates, CLI ve MCP için odaklı paketlerden oluşan katkı dostu monorepo.

## Desteklenen Tarayıcılar

| Hedef | Durum | Notlar |
| --- | --- | --- |
| Chrome | Birinci sınıf | Chromium MV3, dev mode, visual tests, E2E, packaging, release checks. |
| Edge | Birinci sınıf | Edge executable ve store readiness yollarıyla Chromium uyumlu. |
| Opera | Birinci sınıf | Opera executable ve package naming desteğiyle Chromium uyumlu. |
| Firefox | Destekleniyor | Tarayıcıya özel uyarılarla MV3 generation, compatibility diagnostics, packaging ve release checks. |
| Safari | Deneysel | Safari/macOS/Xcode gereksinimleri için capability reporting; tam store packaging henüz iddia edilmez. |

## Hızlı Başlangıç

Depoyu klonlayın ve workspace'i build edin:

```sh
pnpm install
pnpm build
```

Yerel CLI ile yeni bir uzantı projesi oluşturun:

```sh
node packages/cli/dist/index.js init my-extension --template vanilla
cd my-extension
pnpm install
pnpm exec openext build all
pnpm exec openext doctor --target chrome
pnpm exec openext test all
pnpm exec openext package all
```

Yayınlanmış paket kurulumu bu pre-release README kapsamına alınmamıştır. Paket yayınlanana ve API'ler stable olarak işaretlenene kadar yukarıdaki yerel workspace komutlarını kullanın.

## Yaygın İş Akışları

```sh
# Günlük Chromium uzantı geliştirme
OPENEXTKIT_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" openext dev chrome

# Token korumalı build/test/package/doctor actions içeren yerel dashboard
openext dashboard

# Hedef diagnostics ve compatibility guidance
openext doctor --target chrome
openext inspect permissions chrome --advisor
openext compat fix firefox --dry-run

# Visual checks, baselines ve recording
openext visual chrome
openext visual chrome --update
openext visual chrome --compare
openext visual chrome --record

# E2E checks
openext e2e chrome
openext e2e chrome --recipe-file openext.e2e.json

# Release readiness ve yerel submission assets
openext review all
openext publish-wizard all
openext submit-assets all
openext release-report
```

Tarayıcı otomasyonu komutları, tarayıcı otomatik bulunamazsa executable path ister:

- `OPENEXTKIT_CHROME_EXECUTABLE`
- `OPENEXTKIT_EDGE_EXECUTABLE`
- `OPENEXTKIT_OPERA_EXECUTABLE`

## Template'ler

Minimal bir template veya daha zengin ürün odaklı starter ile başlayın:

```sh
openext init my-extension --template react-popup
openext templates --json
openext templates gallery
```

Dahil edilen template'ler vanilla extensions, React popups, content scripts, focus blockers, new tabs, AI sidebars, command palettes, tab managers, context menu tools, web clippers, bookmark managers, shopping assistants, passwordless auth helpers, developer inspectors ve daha fazlasını kapsar. Bkz. [docs/templates.md](../templates.md).

## MCP ve AI Kodlama Araçları

OpenExtKit, AI kodlama araçlarının uzantı projelerini kapsamı belirlenmiş yerel araçlarla inceleyip çalıştırabilmesi için bir MCP server içerir:

```sh
openext mcp
```

Yararlı MCP tools: diagnostics, browser tests, visual regression, E2E recipes, template listing, deterministic extension review, visual review, packaging ve release reports. Bkz. [docs/mcp-tools.md](../mcp-tools.md), [apps/docs/using-with-codex.md](../../apps/docs/using-with-codex.md), [apps/docs/using-with-claude-code.md](../../apps/docs/using-with-claude-code.md), [apps/docs/using-with-cursor.md](../../apps/docs/using-with-cursor.md) ve [apps/docs/using-with-windsurf.md](../../apps/docs/using-with-windsurf.md).

## Depo Yapısı

OpenExtKit bir pnpm ve Turborepo monorepo'sudur:

- `packages/core`: configuration schema, target registry, project resolution ve shared types.
- `packages/manifest`: target-specific Manifest V3 generation ve permission analysis.
- `packages/browser`: cross-browser extension API wrapper.
- `packages/testing`: smoke, visual, regression, recorder ve E2E utilities.
- `packages/packaging`: build outputs, zip packaging ve artifact reports.
- `packages/release`: publish readiness, store metadata, submission assets ve review data.
- `packages/templates`: starter templates ve preview metadata.
- `packages/cli`: `openext` command-line interface.
- `packages/mcp-server`: AI coding agents için MCP tools.
- `docs` ve `apps/docs`: project documentation.
- `examples`: çalıştırılabilir extension examples.

## Dokümantasyon

- [Getting started](../../apps/docs/quick-start.md)
- [Development workflows](../development.md)
- [Testing extensions](../testing.md)
- [Browser support](../browser-support.md)
- [Publishing and store readiness](../publishing.md)
- [Templates](../templates.md)
- [MCP tools](../mcp-tools.md)
- [Security model](../security.md)
- [Architecture](../architecture.md)
- [Roadmap](../../apps/docs/roadmap.md)

## Katkıda Bulunma

Katkılar memnuniyetle karşılanır. [CONTRIBUTING.md](../../CONTRIBUTING.md) ile başlayın, ardından pull request açmadan önce standart kontrolleri çalıştırın:

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

Lütfen [Code of Conduct](../../CODE_OF_CONDUCT.md) kurallarına uyun, güvenlik açıklarını [SECURITY.md](../../SECURITY.md) üzerinden bildirin ve değişiklikleri incelemesi kolay olacak şekilde odaklı tutun.

## Lisans

OpenExtKit [MIT License](../../LICENSE) ile yayınlanır.
