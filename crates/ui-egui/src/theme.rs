//! Design tokens (InDesign's four interface brightness levels), fonts and egui style.

use std::sync::Arc;

use egui::{Color32, CornerRadius, FontData, FontDefinitions, FontFamily, FontId, Stroke, TextStyle, Visuals};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum Brightness {
    Dark,
    #[default]
    MediumDark,
    MediumLight,
    Light,
    /// Accessibility: black chrome, white text, yellow selection and focus.
    HighContrast,
    /// AI Вёрстка's Brand theme: navy chrome, the brand's blue-violet accent, solid black menus
    /// and windows with a strong shadow, and the brand backdrop round the pages (which stay white).
    Brand,
}

impl Brightness {
    pub const ALL: [Brightness; 6] =
        [Brightness::Brand, Brightness::Dark, Brightness::MediumDark, Brightness::MediumLight, Brightness::Light, Brightness::HighContrast];
    pub fn label(self) -> &'static str {
        match self {
            Brightness::Dark => "Dark",
            Brightness::MediumDark => "Medium Dark",
            Brightness::MediumLight => "Medium Light",
            Brightness::Light => "Light",
            Brightness::HighContrast => "High Contrast",
            Brightness::Brand => "Brand",
        }
    }
    pub fn id(self) -> &'static str {
        match self {
            Brightness::Dark => "dark",
            Brightness::MediumDark => "mediumDark",
            Brightness::MediumLight => "mediumLight",
            Brightness::Light => "light",
            Brightness::HighContrast => "highContrast",
            Brightness::Brand => "brand",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|b| b.id().eq_ignore_ascii_case(s) || b.label().eq_ignore_ascii_case(s))
    }
}

/// Every colour the UI uses. Widgets never hard-code colours.
#[derive(Clone, Copy, Debug)]
pub struct Tokens {
    pub dark: bool,
    /// The Brand theme: black menus and windows with a strong shadow, the brand backdrop round
    /// the pages ([`paint_brand_backdrop`]).
    pub brand: bool,
    /// AI Вёрстка's Light and Dark: our neumorphic palettes (soft blue-grey chrome, rounded
    /// controls, tinted soft shadows).
    pub neu: bool,
    /// Text and icons drawn on `accent_strong` (white, but dark on the Dark theme's light blue).
    pub on_accent: Color32,
    pub app_bar: Color32,
    pub panel: Color32,
    pub panel_darker: Color32,
    pub input: Color32,
    pub input_border: Color32,
    pub divider: Color32,
    pub text: Color32,
    pub text_strong: Color32,
    pub text_dim: Color32,
    pub text_disabled: Color32,
    pub icon: Color32,
    pub hover: Color32,
    pub tool_active: Color32,
    pub accent: Color32,
    pub accent_strong: Color32,
    pub row_selected: Color32,
    pub pasteboard: Color32,
    pub ruler: Color32,
    pub ruler_tick: Color32,
    pub tab_inactive: Color32,
    pub button: Color32,
    pub radius: u8,
    /// 1 pt chrome edges.
    pub border: Color32,
    /// Outline of fields and buttons.
    pub field_border: Color32,
    /// Active tool / toggle well.
    pub well: Color32,
    pub well_rim: Color32,
    pub ruler_text: Color32,
    pub section_divider: Color32,
    /// Panel tab strips, doc-tab bar, dock headers.
    pub tab_strip: Color32,
    /// Smart guides and spacing marks drawn over the page.
    pub smart_guide: Color32,
    /// Measurement labels on the canvas (smart dimensions, gaps).
    pub measure_bg: Color32,
    pub measure_text: Color32,
    /// The readout beside the cursor while drawing, moving or measuring ("W: 3.13 cm"): InDesign's
    /// light grey box, with dark text in every brightness but High Contrast.
    pub readout_bg: Color32,
    pub readout_text: Color32,
    /// Live-corner widget and corner diamonds.
    pub live_corner: Color32,
    /// The Windows caption Close button when hovered, and its glyph.
    pub caption_close: Color32,
    pub caption_close_text: Color32,
}

fn hex(s: u32) -> Color32 {
    Color32::from_rgb((s >> 16) as u8, (s >> 8) as u8, s as u8)
}

impl Tokens {
    pub fn for_brightness(b: Brightness) -> Self {
        let dark = Tokens {
            dark: true,
            brand: false,
            neu: false,
            on_accent: Color32::WHITE,
            app_bar: hex(0x262626),
            panel: hex(0x323232),
            panel_darker: hex(0x282828),
            input: hex(0x1f1f1f),
            input_border: hex(0x4a4a4a),
            divider: hex(0x1e1e1e),
            text: hex(0xd8d8d8),
            text_strong: hex(0xf2f2f2),
            text_dim: hex(0xa3a3a3),
            text_disabled: hex(0x6a6a6a),
            icon: hex(0xc8c8c8),
            hover: hex(0x424242),
            tool_active: hex(0x1b1b1b),
            accent: hex(0x378ef0),
            accent_strong: hex(0x1473e6),
            row_selected: hex(0x2d4f7c),
            pasteboard: hex(0x232323),
            ruler: hex(0x2e2e2e),
            ruler_tick: hex(0x9a9a9a),
            tab_inactive: hex(0x262626),
            button: hex(0x404040),
            radius: 1,
            border: hex(0x1e1e1e),
            field_border: hex(0x5a5a5a),
            well: hex(0x1b1b1b),
            well_rim: hex(0x3a3a3a),
            ruler_text: hex(0xd8d8d8),
            section_divider: hex(0x282828),
            tab_strip: hex(0x282828),
            smart_guide: hex(0x00c853),
            measure_bg: Color32::from_rgba_unmultiplied(70, 70, 70, 230),
            measure_text: Color32::WHITE,
            readout_bg: hex(0xa8a8a8),
            readout_text: hex(0x1e1e1e),
            live_corner: hex(0xffe500),
            caption_close: hex(0xc42b1c),
            caption_close_text: Color32::WHITE,
        };
        match b {
            // AI Вёрстка's Dark: the NeuDark palette (chrome #262D3A, cards #282F3D, canvas #1B202A,
            // fields #202632, text #E4EBF6 / #C4CFE0 / #A0ADC2, accent #5CA8FF with dark text on it).
            Brightness::Dark => Tokens {
                neu: true,
                app_bar: hex(0x262d3a),
                panel: hex(0x282f3d),
                panel_darker: hex(0x222834),
                input: hex(0x202632),
                input_border: hex(0x3b4558),
                divider: hex(0x1c222c),
                text: hex(0xc4cfe0),
                text_strong: hex(0xe4ebf6),
                text_dim: hex(0xa0adc2),
                text_disabled: hex(0x657189),
                icon: hex(0xc4cfe0),
                hover: hex(0x323a4a),
                tool_active: hex(0x1e2430),
                accent: hex(0x8ec6ff),
                accent_strong: hex(0x5ca8ff),
                on_accent: hex(0x0b1220),
                row_selected: hex(0x2c4a6e),
                pasteboard: hex(0x1b202a),
                ruler: hex(0x222834),
                ruler_tick: hex(0x8c98ae),
                tab_inactive: hex(0x232a36),
                button: hex(0x2d3544),
                radius: 6,
                border: hex(0x1c222c),
                field_border: hex(0x465166),
                well: hex(0x1e2430),
                well_rim: hex(0x3a4456),
                ruler_text: hex(0xc4cfe0),
                section_divider: hex(0x232a36),
                tab_strip: hex(0x232a36),
                measure_bg: Color32::from_rgba_unmultiplied(0x2b, 0x33, 0x42, 235),
                ..dark
            },
            // The brand gradient's navy (#0a0a0f → #1a1a2e → #16213e) for the chrome, the brand's
            // blue-violet (#667eea) for the accent; pages stay white.
            Brightness::Brand => Tokens {
                brand: true,
                app_bar: hex(0x0c0d17),
                panel: hex(0x16182a),
                panel_darker: hex(0x111222),
                input: hex(0x1f2238),
                input_border: hex(0x4a4f75),
                divider: hex(0x2a2d46),
                text: hex(0xeef0ff),
                text_strong: hex(0xffffff),
                text_dim: hex(0xb7bbd8),
                text_disabled: hex(0x6b6f8f),
                icon: hex(0xf3f4ff),
                hover: hex(0x22253e),
                tool_active: hex(0x2d3152),
                accent: hex(0x8a9bff),
                accent_strong: hex(0x667eea),
                row_selected: hex(0x2a3066),
                pasteboard: BRAND_CANVAS,
                ruler: hex(0x12131f),
                ruler_tick: hex(0xb7bbd8),
                tab_inactive: hex(0x0c0d17),
                button: hex(0x1f2238),
                radius: 4,
                border: hex(0x2a2d46),
                field_border: hex(0x4a4f75),
                well: hex(0x2a3066),
                well_rim: hex(0x3a3e5e),
                ruler_text: hex(0xd8dbf0),
                section_divider: hex(0x2a2d46),
                tab_strip: hex(0x0c0d17),
                measure_bg: Color32::from_rgba_unmultiplied(0x1b, 0x1e, 0x3a, 235),
                ..dark
            },
            // Measured from InDesign 2026 (plan/indesign/11-observed-ui.md §1).
            Brightness::MediumDark => Tokens {
                app_bar: hex(0x535353),
                panel: hex(0x535353),
                panel_darker: hex(0x424242),
                input: hex(0x454545),
                input_border: hex(0x747474),
                divider: hex(0x4b4b4b),
                text: hex(0xffffff),
                text_strong: hex(0xffffff),
                text_dim: hex(0xb0b0b0),
                text_disabled: hex(0x8a8a8a),
                icon: hex(0xc2c2c2),
                hover: hex(0x606060),
                tool_active: hex(0x303030),
                row_selected: hex(0x4a6a92),
                pasteboard: hex(0x5e5e5e),
                ruler: hex(0x1f1f1f),
                ruler_tick: hex(0x858585),
                tab_inactive: hex(0x424242),
                button: hex(0x535353),
                border: hex(0x383838),
                field_border: hex(0x747474),
                well: hex(0x303030),
                well_rim: hex(0x565656),
                ruler_text: hex(0xffffff),
                section_divider: hex(0x4b4b4b),
                tab_strip: hex(0x424242),
                ..dark
            },
            Brightness::MediumLight => Tokens {
                dark: false,
                app_bar: hex(0xa8a8a8),
                panel: hex(0xb8b8b8),
                panel_darker: hex(0xaaaaaa),
                input: hex(0xd6d6d6),
                input_border: hex(0x8c8c8c),
                divider: hex(0x9c9c9c),
                text: hex(0x1e1e1e),
                text_strong: hex(0x000000),
                text_dim: hex(0x3c3c3c),
                text_disabled: hex(0x7a7a7a),
                icon: hex(0x2a2a2a),
                hover: hex(0xc8c8c8),
                tool_active: hex(0x9a9a9a),
                row_selected: hex(0x8eb2e0),
                pasteboard: hex(0xa0a0a0),
                ruler: hex(0xc0c0c0),
                ruler_tick: hex(0x3a3a3a),
                tab_inactive: hex(0xa6a6a6),
                button: hex(0xb8b8b8),
                border: hex(0x8c8c8c),
                field_border: hex(0x7a7a7a),
                well: hex(0x9a9a9a),
                well_rim: hex(0x8a8a8a),
                ruler_text: hex(0x1e1e1e),
                section_divider: hex(0x9c9c9c),
                tab_strip: hex(0xa6a6a6),
                ..dark
            },
            // AI Вёрстка's Light: the NeuLight palette (chrome #E4ECF6, cards #E6EEF8, canvas #D6E0ED,
            // fields #DCE6F3, text #1E2C42 / #34445E / #4E5E78, accent #3480E2, accent text #1652A8).
            Brightness::Light => Tokens {
                dark: false,
                neu: true,
                app_bar: hex(0xe4ecf6),
                panel: hex(0xe6eef8),
                panel_darker: hex(0xdce5f1),
                input: hex(0xdce6f3),
                input_border: hex(0xb3c2d6),
                divider: hex(0xc9d5e5),
                text: hex(0x34445e),
                text_strong: hex(0x1e2c42),
                text_dim: hex(0x4e5e78),
                text_disabled: hex(0x8d9ab0),
                icon: hex(0x34445e),
                hover: hex(0xd5e0ee),
                tool_active: hex(0xc8d6ea),
                accent: hex(0x1652a8),
                accent_strong: hex(0x3480e2),
                row_selected: hex(0xc2d8f5),
                pasteboard: hex(0xd6e0ed),
                ruler: hex(0xe9f0f8),
                ruler_tick: hex(0x4e5e78),
                tab_inactive: hex(0xdae3ef),
                button: hex(0xe6eef8),
                radius: 6,
                border: hex(0xc9d5e5),
                field_border: hex(0xb3c2d6),
                well: hex(0xccd9ea),
                well_rim: hex(0xb7c7dc),
                ruler_text: hex(0x34445e),
                section_divider: hex(0xd2dce9),
                tab_strip: hex(0xdde6f2),
                measure_bg: Color32::from_rgba_unmultiplied(0x34, 0x44, 0x5e, 230),
                ..dark
            },
            Brightness::HighContrast => Tokens {
                app_bar: hex(0x000000),
                panel: hex(0x000000),
                panel_darker: hex(0x000000),
                input: hex(0x000000),
                input_border: hex(0xffffff),
                divider: hex(0xffffff),
                text: hex(0xffffff),
                text_strong: hex(0xffffff),
                text_dim: hex(0xe6e6e6),
                text_disabled: hex(0xa0a0a0),
                icon: hex(0xffffff),
                hover: hex(0x3d3d00),
                tool_active: hex(0x5c5c00),
                accent: hex(0xffeb3b),
                accent_strong: hex(0xffd600),
                row_selected: hex(0x5c5c00),
                pasteboard: hex(0x1a1a1a),
                ruler: hex(0x000000),
                ruler_tick: hex(0xffffff),
                tab_inactive: hex(0x000000),
                button: hex(0x000000),
                border: hex(0xffffff),
                field_border: hex(0xffffff),
                well: hex(0x5c5c00),
                well_rim: hex(0xffeb3b),
                ruler_text: hex(0xffffff),
                section_divider: hex(0xffffff),
                tab_strip: hex(0x000000),
                // White on InDesign's grey is too faint here: black, as the rest of the chrome.
                readout_bg: hex(0x000000),
                readout_text: Color32::WHITE,
                ..dark
            },
        }
    }
}

/// Install the UI fonts for the interface language `lang` (it orders the CJK fallbacks).
/// Returns false while the installed fonts are still being cataloged: the built-in faces are
/// installed without waiting, and the caller installs again once they are (see
/// [`system_fonts_ready`]) to add the installed faces for the scripts they lack.
pub fn install_fonts(ctx: &egui::Context, lang: &str) -> bool {
    let craft = designcraft_fonts::CRAFT_FONTS;
    let mut defs = font_definitions(craft, lang);
    let system = system_ui_fonts(craft);
    let found = system.is_some();
    if let Some(system) = &system {
        add_system_fallbacks(&mut defs, system, lang);
    }
    ctx.set_fonts(defs);
    found
}

/// Whether [`install_fonts`] would find the installed fonts cataloged.
pub fn system_fonts_ready() -> bool {
    designcraft_fonts::FontDb::global().system_fonts_cataloged()
}

/// An installed font the UI falls back to for a script the built-in faces lack.
#[derive(Clone)]
pub(crate) struct SystemFont {
    /// The ISO 15924 code of the script it is for ("Jpan", "Kore", "Taml"…).
    script: &'static str,
    family: String,
    /// The face as egui takes it, on the UI face's baseline. Shared: installing the fonts again
    /// (another interface language) doesn't copy the file.
    data: Arc<FontData>,
}

impl SystemFont {
    pub(crate) fn new(script: &'static str, family: String, bytes: Vec<u8>, index: u32) -> Self {
        let tweak = baseline_tweak(&bytes, index);
        SystemFont { script, family, data: Arc::new(FontData { index, tweak, ..FontData::from_owned(bytes) }) }
    }
}

/// Installed UI faces (sans serif) per script, with a character every face of the script has:
/// the first listed family that is installed and covers the character, macOS families first,
/// then Windows, then Linux. One family can serve several scripts (Nirmala UI covers the Indic
/// scripts); it is added once.
const SYSTEM_UI_FONTS: &[(&str, char, &[&str])] = &[
    (
        "Jpan",
        'あ',
        &[
            "Hiragino Sans",
            "Hiragino Kaku Gothic ProN",
            "Yu Gothic UI",
            "Yu Gothic",
            "Meiryo",
            "MS Gothic",
            "Noto Sans CJK JP",
            "Noto Sans JP",
            "Source Han Sans JP",
            "IPAexGothic",
            "Droid Sans Fallback",
        ],
    ),
    ("Hans", '中', &["PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Micro Hei"]),
    // Traditional Chinese and Korean: font menus list those families under their native names.
    ("Hant", '中', &["PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", "Source Han Sans TC"]),
    ("Kore", '한', &["Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", "Noto Sans KR", "Source Han Sans K", "NanumGothic", "UnDotum"]),
    // Scripts the built-in faces lack, after the CJK ones (text in the Story Editor, font names).
    ("Taml", 'த', &["Tamil Sangam MN", "Tamil MN", "Nirmala UI", "Latha", "Noto Sans Tamil", "Noto Sans Tamil UI", "Lohit Tamil"]),
    ("Deva", 'क', &["Kohinoor Devanagari", "Devanagari Sangam MN", "Nirmala UI", "Mangal", "Noto Sans Devanagari", "Lohit Devanagari"]),
    ("Beng", 'ক', &["Kohinoor Bangla", "Bangla Sangam MN", "Nirmala UI", "Vrinda", "Noto Sans Bengali", "Lohit Bengali"]),
    ("Gujr", 'ક', &["Kohinoor Gujarati", "Gujarati Sangam MN", "Nirmala UI", "Shruti", "Noto Sans Gujarati", "Lohit Gujarati"]),
    ("Guru", 'ਕ', &["Gurmukhi Sangam MN", "Gurmukhi MN", "Nirmala UI", "Raavi", "Noto Sans Gurmukhi", "Lohit Gurmukhi"]),
    ("Knda", 'ಕ', &["Kannada Sangam MN", "Nirmala UI", "Tunga", "Noto Sans Kannada", "Lohit Kannada"]),
    ("Mlym", 'ക', &["Malayalam Sangam MN", "Nirmala UI", "Kartika", "Noto Sans Malayalam", "Lohit Malayalam"]),
    ("Telu", 'క', &["Kohinoor Telugu", "Telugu Sangam MN", "Nirmala UI", "Gautami", "Noto Sans Telugu", "Lohit Telugu"]),
    ("Orya", 'କ', &["Oriya Sangam MN", "Nirmala UI", "Kalinga", "Noto Sans Oriya", "Lohit Odia"]),
    ("Sinh", 'ක', &["Sinhala Sangam MN", "Nirmala UI", "Iskoola Pota", "Noto Sans Sinhala", "LKLUG"]),
    ("Thai", 'ก', &["Thonburi", "Leelawadee UI", "Tahoma", "Noto Sans Thai", "Loma"]),
    ("Khmr", 'ក', &["Khmer Sangam MN", "Leelawadee UI", "Khmer UI", "Noto Sans Khmer", "Khmer OS"]),
    ("Laoo", 'ກ', &["Lao Sangam MN", "Leelawadee UI", "Lao UI", "Noto Sans Lao", "Phetsarath OT"]),
    ("Mymr", 'က', &["Myanmar Sangam MN", "Myanmar Text", "Noto Sans Myanmar", "Padauk"]),
    ("Hebr", 'א', &["Arial Hebrew", "Segoe UI", "Noto Sans Hebrew", "DejaVu Sans"]),
    ("Armn", 'Ա', &["Mshtakan", "Segoe UI", "Sylfaen", "Noto Sans Armenian", "DejaVu Sans"]),
    ("Geor", 'ა', &["Segoe UI", "Sylfaen", "Noto Sans Georgian", "DejaVu Sans"]),
    ("Ethi", 'አ', &["Kefa", "Ebrima", "Nyala", "Noto Sans Ethiopic", "Abyssinica SIL"]),
];

/// The installed faces for the scripts `craft` (the built-in craft-fonts) doesn't cover, so the
/// interface shows Japanese and Chinese without the craft-fonts build input, and Korean,
/// Traditional Chinese (font names in the font menus), Indic, Southeast Asian and other scripts
/// in any build. egui can't find system fonts itself; the document font scan (not on the web)
/// does.
fn system_ui_fonts(craft: &[designcraft_fonts::CraftFont]) -> Option<Vec<SystemFont>> {
    static FACES: std::sync::OnceLock<Vec<SystemFont>> = std::sync::OnceLock::new();
    let db = designcraft_fonts::FontDb::global();
    // Never wait for the font scan here (the first frame): it runs in the background, and the
    // faces are read once, when it is done.
    if !db.system_fonts_cataloged() && !cfg!(test) {
        db.scan_in_background();
        return None;
    }
    if cfg!(test) {
        // Tests install controlled faces in the process-wide database (`testing::font_with`),
        // so the set cannot be cached across them; a cached empty first call would otherwise
        // hide every face a later test adds. Cataloging here is a no-op once it is done (the
        // web has no system fonts).
        #[cfg(not(target_arch = "wasm32"))]
        let _ = db.load_system_fonts();
        return Some(installed_ui_fonts(db, craft));
    }
    Some(FACES.get_or_init(|| installed_ui_fonts(db, craft)).to_vec())
}

/// The faces of [`SYSTEM_UI_FONTS`] that `db` has, for the scripts `craft` doesn't cover.
fn installed_ui_fonts(db: &designcraft_fonts::FontDb, craft: &[designcraft_fonts::CraftFont]) -> Vec<SystemFont> {
    let mut faces: Vec<SystemFont> = Vec::new();
    for (script, sample, families) in SYSTEM_UI_FONTS {
        if craft.iter().any(|f| f.scripts.contains(script)) {
            continue;
        }
        let found = families.iter().find_map(|family| {
            if !db.has_family(family) {
                return None;
            }
            let face = db.face(family, "Regular");
            // Keep the requested family, and leave bundled document faces to the craft UI stack.
            (face.family.eq_ignore_ascii_case(family)
                && !matches!(&face.source, designcraft_fonts::FontSource::Bundled)
                && !face.data().is_empty()
                && face.covers(*sample))
            .then_some((family, face))
        });
        let Some((family, face)) = found else { continue };
        if !faces.iter().any(|f| f.family.eq_ignore_ascii_case(family)) {
            faces.push(SystemFont::new(script, (*family).to_string(), face.data().to_vec(), face.index()));
        }
    }
    faces
}

/// The UI face every family starts with (Source Sans 3; the semibold shares its line metrics).
const UI_FONT: &[u8] = include_bytes!("../../../assets/fonts/SourceSans3-Regular.ttf");

/// The tweak that puts a fallback face's baseline on the UI face's. egui centres a fallback's
/// line height in the primary's instead (`pos.y = ascent + (line height − its line height) / 2`),
/// so a CJK face with a taller ascent or a larger line gap would sit above or below the Latin
/// text beside it. Shifts are in ems of the font size.
pub(crate) fn baseline_tweak(face: &[u8], index: u32) -> egui::FontTweak {
    let metrics = |data: &[u8], i: u32| {
        designcraft_fonts::line_metrics(data, i).map(|(upem, ascent, descent, gap)| (ascent / upem, (ascent - descent + gap) / upem))
    };
    let shift = match (metrics(UI_FONT, 0), metrics(face, index)) {
        (Some((ap, hp)), Some((af, hf))) => ap - (af + 0.5 * (hp - hf)),
        _ => 0.0,
    };
    egui::FontTweak { y_offset_factor: if shift.is_finite() { shift.clamp(-0.5, 0.5) } else { 0.0 }, ..Default::default() }
}

/// The script whose letterforms the interface language `lang` prefers for Han characters, Kana
/// and Hangul: "Jpan", "Hans", "Hant" or "Kore". Languages without a CJK preference use Japanese
/// forms, the app's default CJK face.
fn cjk_script(lang: &str) -> &'static str {
    match lang {
        "zh" | "zh-hans" | "zh-cn" => "Hans",
        "zh-hant" | "zh-tw" | "zh-hk" => "Hant",
        "ko" => "Kore",
        _ => "Jpan",
    }
}

/// Add installed faces `system` to every family in the interface language's order: the faces of
/// its script (`cjk_script`) go before the built-in CJK faces, so Han characters take that
/// language's forms (Traditional Chinese, Korean); the other CJK faces go at the end, then the
/// other scripts' faces.
pub(crate) fn add_system_fallbacks(fonts: &mut FontDefinitions, system: &[SystemFont], lang: &str) {
    let name = |f: &SystemFont| format!("system-{}", f.family);
    for f in system {
        fonts.font_data.insert(name(f), f.data.clone());
    }
    let first = cjk_script(lang);
    let preferred: Vec<String> = system.iter().filter(|f| f.script == first).map(name).collect();
    const CJK: [&str; 4] = ["Jpan", "Hans", "Hant", "Kore"];
    let rest: Vec<String> = CJK
        .iter()
        .filter(|s| **s != first)
        .flat_map(|s| system.iter().filter(move |f| f.script == *s))
        .chain(system.iter().filter(|f| !CJK.contains(&f.script)))
        .map(name)
        .collect();
    for (family, stack) in fonts.families.iter_mut() {
        // The Arabic families keep their own order (see `font_definitions`).
        let arabic = matches!(family, FontFamily::Name(n) if n.starts_with("arabic"));
        let at = if arabic { stack.len() } else { stack.iter().position(|n| n.starts_with("craft-")).unwrap_or(stack.len()) };
        stack.splice(at..at, preferred.iter().cloned());
        stack.extend(rest.iter().cloned());
    }
}

/// The UI fonts: the app's own, then the craft-fonts faces from `craft` (empty without
/// `CRAFT_FONTS_DIR`) as fallbacks at the end of every family: Japanese (BIZ UDPGothic first) and
/// Simplified Chinese, in the interface language's order, then Arabic and Georgian. The `arabic` families
/// put the Arabic face first for right-to-left runs. egui has no system-font discovery, so
/// without craft-fonts CJK, Arabic and Georgian UI text has no glyphs.
pub(crate) fn font_definitions(craft: &'static [designcraft_fonts::CraftFont], lang: &str) -> FontDefinitions {
    let mut fonts = FontDefinitions::default();
    let add = |fonts: &mut FontDefinitions, name: &str, data: &'static [u8]| {
        fonts.font_data.insert(name.into(), Arc::new(FontData::from_static(data)));
    };
    // egui's last-resort faces (Ubuntu-Light, egui-icons and, with `monochrome_emoji_fonts`,
    // NotoEmoji-Regular and emoji-icon-font): every family ends with them so a glyph outside
    // the requested face and the script faces (☰, ⚠, 📋) is not tofu. Captured before the
    // interface face is added.
    let last_resort: Vec<String> = fonts.families.get(&FontFamily::Proportional).cloned().unwrap_or_default();
    add(&mut fonts, "ui", include_bytes!("../../../assets/fonts/SourceSans3-Regular.ttf"));
    add(&mut fonts, "ui-semibold", include_bytes!("../../../assets/fonts/SourceSans3-Semibold.ttf"));
    add(&mut fonts, "mono", include_bytes!("../../../assets/fonts/JetBrainsMono-Regular.ttf"));
    fonts.families.entry(FontFamily::Proportional).or_default().insert(0, "ui".into());
    fonts.families.entry(FontFamily::Monospace).or_default().insert(0, "mono".into());
    fonts.families.insert(FontFamily::Name("semibold".into()), vec!["ui-semibold".into(), "ui".into()]);
    let pick = |script: &str| -> Vec<&designcraft_fonts::CraftFont> { craft.iter().filter(|f| f.scripts.contains(&script)).collect() };
    let mut japanese = pick("Jpan");
    // BIZ UDPGothic (the UI face) first, Regular before Bold; the semibold family prefers Bold.
    japanese.sort_by_key(|f| (f.family != "BIZ UDPGothic", f.style != "Regular"));
    let chinese = pick("Hans");
    let arabic = pick("Arab");
    let georgian = pick("Geor");
    // The manifest can add scripts without a special UI preference order (Hebrew, Devanagari,
    // ...). They still need installing: system fallback discovery skips scripts supplied here.
    let other: Vec<_> = craft.iter().filter(|f| !["Jpan", "Hans", "Arab", "Geor"].iter().any(|s| f.scripts.contains(s))).collect();
    let name = |f: &designcraft_fonts::CraftFont| format!("craft-{}-{}", f.family, f.style);
    for f in japanese.iter().chain(&chinese) {
        // CJK faces sit on the Latin baseline (see `baseline_tweak`).
        fonts.font_data.insert(name(f), Arc::new(FontData { tweak: baseline_tweak(f.bytes, 0), ..FontData::from_static(f.bytes) }));
    }
    for f in arabic.iter().chain(&georgian).chain(&other) {
        add(&mut fonts, &name(f), f.bytes);
    }
    // Han characters take the forms of the interface language: Chinese faces first for Chinese.
    let zh = matches!(cjk_script(lang), "Hans" | "Hant");
    for (family, stack) in fonts.families.iter_mut() {
        let bold = *family == FontFamily::Name("semibold".into());
        let mut ja = japanese.clone();
        if bold {
            ja.sort_by_key(|f| (f.family != "BIZ UDPGothic", f.style != "Bold"));
        }
        let (first, second) = if zh { (&chinese, &ja) } else { (&ja, &chinese) };
        stack.extend(first.iter().chain(second).chain(&arabic).chain(&georgian).chain(&other).map(|f| name(f)));
    }
    // A bold label keeps every icon/emoji glyph the regular one has: the semibold family ends
    // with the same last-resort faces, after the script faces.
    if let Some(stack) = fonts.families.get_mut(&FontFamily::Name("semibold".into())) {
        stack.extend(last_resort.iter().cloned());
    }
    // Arabic runs: the Arabic face first, so letters and spaces shape as one run. These families
    // keep every other family's fallbacks (the interface faces, the CJK, Arabic and Georgian
    // script faces, then egui's last-resort icon/emoji faces) so Latin, symbols and emoji inside
    // Arabic text are not tofu.
    for family in ["arabic", "arabic-semibold"] {
        let ui = if family == "arabic" { "ui" } else { "ui-semibold" };
        let stack = arabic
            .iter()
            .map(|f| name(f))
            .chain([ui.to_string(), "ui".to_string()])
            .chain(japanese.iter().chain(&chinese).chain(&georgian).chain(&other).map(|f| name(f)))
            .chain(last_resort.iter().cloned());
        let mut seen = std::collections::HashSet::new();
        fonts.families.insert(FontFamily::Name(family.into()), stack.filter(|n| seen.insert(n.clone())).collect());
    }
    fonts
}

pub fn semibold(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name("semibold".into()))
}

pub fn apply(ctx: &egui::Context, t: &Tokens) {
    ctx.data_mut(|d| d.insert_temp(egui::Id::NULL, *t));
    let text_styles: std::collections::BTreeMap<TextStyle, FontId> = [
        (TextStyle::Small, FontId::proportional(10.0)),
        (TextStyle::Body, FontId::proportional(11.0)),
        (TextStyle::Button, FontId::proportional(11.0)),
        (TextStyle::Heading, FontId::new(15.0, FontFamily::Name("semibold".into()))),
        (TextStyle::Monospace, FontId::monospace(11.5)),
    ]
    .into();
    let mut v = if t.dark { Visuals::dark() } else { Visuals::light() };
    let r = CornerRadius::same(t.radius);
    v.panel_fill = t.panel;
    v.window_fill = t.panel;
    v.extreme_bg_color = t.input;
    v.faint_bg_color = t.panel_darker;
    v.window_stroke = Stroke::new(1.0, t.divider);
    v.window_corner_radius = CornerRadius::same(4);
    v.menu_corner_radius = CornerRadius::same(4);
    v.selection.bg_fill = t.accent_strong;
    v.selection.stroke = Stroke::new(1.0, t.text_strong);
    v.hyperlink_color = t.accent;
    v.override_text_color = Some(t.text);
    craft_ui::theme::WidgetPalette { noninteractive: t.panel, inactive: t.button, hovered: t.hover, active: t.tool_active, open: t.hover }.apply_to(
        &mut v.widgets,
        r,
        Stroke::new(1.0, t.text),
    );
    v.widgets.noninteractive.bg_stroke = Stroke::new(1.0, t.divider);
    v.widgets.inactive.bg_stroke = Stroke::new(1.0, t.field_border);
    v.widgets.hovered.bg_stroke = Stroke::new(1.0, t.field_border);
    v.widgets.active.bg_stroke = Stroke::new(1.0, t.field_border);
    // InDesign buttons are outline-only.
    v.widgets.inactive.weak_bg_fill = Color32::TRANSPARENT;
    v.widgets.inactive.bg_fill = t.input;
    v.popup_shadow = egui::epaint::Shadow { offset: [0, 4], blur: 12, spread: 0, color: Color32::from_black_alpha(90) };
    if t.neu {
        // Neumorphic Light and Dark: rounded windows and menus, soft shadows tinted with the
        // palette's blue instead of grey.
        let shade = if t.dark { Color32::from_black_alpha(150) } else { Color32::from_rgba_unmultiplied(0x46, 0x5a, 0x82, 70) };
        v.window_corner_radius = CornerRadius::same(10);
        v.menu_corner_radius = CornerRadius::same(8);
        v.popup_shadow = egui::epaint::Shadow { offset: [0, 6], blur: 18, spread: 0, color: shade };
        v.window_shadow = egui::epaint::Shadow { offset: [0, 10], blur: 30, spread: 0, color: shade };
        v.selection.bg_fill =
            if t.dark { Color32::from_rgba_unmultiplied(0x5c, 0xa8, 0xff, 0x66) } else { Color32::from_rgba_unmultiplied(0x34, 0x80, 0xe2, 0x55) };
        v.selection.stroke = Stroke::new(1.0, t.accent_strong);
        v.hyperlink_color = t.accent;
    }
    if t.brand {
        // Brand: menus, popups and windows are solid black blocks with a strong black shadow.
        v.window_fill = Color32::BLACK;
        v.window_stroke = Stroke::new(1.0, hex(0x26283c));
        v.window_corner_radius = CornerRadius::same(8);
        v.menu_corner_radius = CornerRadius::same(6);
        v.popup_shadow = egui::epaint::Shadow { offset: [0, 8], blur: 32, spread: 0, color: Color32::BLACK };
        v.window_shadow = egui::epaint::Shadow { offset: [0, 10], blur: 36, spread: 2, color: Color32::BLACK };
        v.selection.bg_fill = Color32::from_rgba_unmultiplied(0x66, 0x7e, 0xea, 0x88);
        v.hyperlink_color = hex(0xa9b4ff);
    }
    ctx.set_visuals(v);
    ctx.global_style_mut(|s| {
        s.text_styles = text_styles.clone();
        s.spacing.item_spacing = egui::vec2(6.0, 4.0);
        s.spacing.button_padding = egui::vec2(6.0, 2.0);
        s.spacing.interact_size = egui::vec2(20.0, 21.0);
        s.spacing.menu_margin = egui::Margin::same(4);
        s.animation_time = 0.06;
    });
}

/// The colour the Brand backdrop reads as, the document area's colour in the Brand theme.
pub const BRAND_CANVAS: Color32 = Color32::from_rgb(0x16, 0x18, 0x2C);

/// The Brand theme's canvas backdrop, as the owner's page draws it in CSS: the brand gradient
/// (#0a0a0f → #1a1a2e → #16213e at 135°), three soft glows (circles at 20% 80%, 80% 20% and 40% 40%,
/// fading out halfway to the farthest corner), a 30 px grid of 5% white lines, and an inner shadow
/// (`inset 0 0 35px 10px #00000099`) round the edges.
pub fn paint_brand_backdrop(painter: &egui::Painter, rect: egui::Rect) {
    use egui::epaint::{Mesh, Vertex, WHITE_UV};
    let vertex = |pos: egui::Pos2, color: Color32| Vertex { pos, uv: WHITE_UV, color };
    let quad = |m: &mut Mesh, corners: [(egui::Pos2, Color32); 4]| {
        let base = m.vertices.len() as u32;
        m.vertices.extend(corners.iter().map(|(p, c)| vertex(*p, *c)));
        m.indices.extend([base, base + 1, base + 2, base, base + 2, base + 3]);
    };
    // The gradient: at 135° the top-left corner is the first stop, the bottom-right the last, and
    // the other two corners sit on the middle stop.
    let (a, mid, b) = (Color32::from_rgb(0x0A, 0x0A, 0x0F), Color32::from_rgb(0x1A, 0x1A, 0x2E), Color32::from_rgb(0x16, 0x21, 0x3E));
    let mut m = Mesh::default();
    quad(&mut m, [(rect.left_top(), a), (rect.right_top(), mid), (rect.right_bottom(), b), (rect.left_bottom(), mid)]);
    painter.add(egui::Shape::mesh(m));
    // The glows: a fan from the centre colour out to transparent at half the farthest-corner distance.
    for (fx, fy, rgb, alpha) in [(0.2_f32, 0.8_f32, (120, 119, 198), 0.30_f32), (0.8, 0.2, (255, 119, 198), 0.30), (0.4, 0.4, (120, 219, 255), 0.20)]
    {
        let c = rect.min + egui::vec2(rect.width() * fx, rect.height() * fy);
        let far = egui::vec2(rect.width() * fx.max(1.0 - fx), rect.height() * fy.max(1.0 - fy)).length();
        let reach = far * 0.5;
        let inner = Color32::from_rgba_unmultiplied(rgb.0, rgb.1, rgb.2, (alpha * 255.0) as u8);
        let mut g = Mesh::default();
        g.vertices.push(vertex(c, inner));
        const STEPS: u32 = 64;
        for i in 0..=STEPS {
            let angle = std::f32::consts::TAU * i as f32 / STEPS as f32;
            g.vertices.push(vertex(c + egui::vec2(angle.cos(), angle.sin()) * reach, Color32::TRANSPARENT));
        }
        for i in 1..=STEPS {
            g.indices.extend([0, i, i + 1]);
        }
        painter.add(egui::Shape::mesh(g));
    }
    // The grid: lines 30 points apart from the top-left corner.
    let line = Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 13));
    let mut x = rect.left() + 0.5;
    while x < rect.right() {
        painter.vline(x, rect.y_range(), line);
        x += 30.0;
    }
    let mut y = rect.top() + 0.5;
    while y < rect.bottom() {
        painter.hline(rect.x_range(), y, line);
        y += 30.0;
    }
    // The inner shadow: solid for the 10 px spread, then fading over the 35 px blur.
    let dark = |a: f32| Color32::from_rgba_unmultiplied(0, 0, 0, (a * 153.0) as u8);
    let mut sh = Mesh::default();
    for (from, to, a0, a1) in [(0.0_f32, 10.0_f32, 1.0_f32, 0.75_f32), (10.0, 45.0, 0.75, 0.0)] {
        let (r, i0, i1) = (rect, from, to);
        // top, bottom, left, right bands
        quad(
            &mut sh,
            [
                (egui::pos2(r.left(), r.top() + i0), dark(a0)),
                (egui::pos2(r.right(), r.top() + i0), dark(a0)),
                (egui::pos2(r.right(), r.top() + i1), dark(a1)),
                (egui::pos2(r.left(), r.top() + i1), dark(a1)),
            ],
        );
        quad(
            &mut sh,
            [
                (egui::pos2(r.left(), r.bottom() - i1), dark(a1)),
                (egui::pos2(r.right(), r.bottom() - i1), dark(a1)),
                (egui::pos2(r.right(), r.bottom() - i0), dark(a0)),
                (egui::pos2(r.left(), r.bottom() - i0), dark(a0)),
            ],
        );
        quad(
            &mut sh,
            [
                (egui::pos2(r.left() + i0, r.top()), dark(a0)),
                (egui::pos2(r.left() + i1, r.top()), dark(a1)),
                (egui::pos2(r.left() + i1, r.bottom()), dark(a1)),
                (egui::pos2(r.left() + i0, r.bottom()), dark(a0)),
            ],
        );
        quad(
            &mut sh,
            [
                (egui::pos2(r.right() - i1, r.top()), dark(a1)),
                (egui::pos2(r.right() - i0, r.top()), dark(a0)),
                (egui::pos2(r.right() - i0, r.bottom()), dark(a0)),
                (egui::pos2(r.right() - i1, r.bottom()), dark(a1)),
            ],
        );
    }
    painter.add(egui::Shape::mesh(sh));
}

/// The area round the pages: the brand backdrop in the Brand theme (`fill` is [`BRAND_CANVAS`]), else `fill`.
pub fn paint_canvas_fill(painter: &egui::Painter, rect: egui::Rect, fill: Color32) {
    if fill == BRAND_CANVAS {
        paint_brand_backdrop(painter, rect);
    } else {
        painter.rect_filled(rect, 0.0, fill);
    }
}

impl Tokens {
    /// Tokens stored by [`apply`].
    pub fn get(ctx: &egui::Context) -> Tokens {
        ctx.data(|d| d.get_temp::<Tokens>(egui::Id::NULL)).unwrap_or_else(|| Tokens::for_brightness(Brightness::Dark))
    }
}

#[cfg(test)]
mod japanese_font_tests {
    fn families() -> [egui::FontFamily; 3] {
        [egui::FontFamily::Proportional, egui::FontFamily::Monospace, egui::FontFamily::Name("semibold".into())]
    }

    fn ctx_with(craft: &'static [designcraft_fonts::CraftFont]) -> egui::Context {
        let ctx = egui::Context::default();
        ctx.set_fonts(super::font_definitions(craft, "ja"));
        let mut output = ctx.run_ui(egui::RawInput::default(), |_| {});
        output.textures_delta.clear();
        ctx
    }

    /// A newly supplied script must remain usable without any matching installed system font.
    /// Previously craft's script coverage suppressed system discovery while these faces were
    /// omitted from the actual UI font definitions, so a Hebrew tab panicked on its first glyph.
    #[test]
    fn additional_craft_scripts_render_in_every_ui_family() {
        let bytes = Box::leak(designcraft_fonts::testing::font_with("DC extra scripts", &['ד', 'क']).unwrap().into_boxed_slice());
        let craft = Box::leak(
            vec![designcraft_fonts::CraftFont { family: "DC extra scripts", style: "Regular", scripts: &["Hebr", "Deva"], bytes }].into_boxed_slice(),
        );
        let ctx = ctx_with(craft);
        ctx.fonts_mut(|fonts| {
            for family in families().into_iter().chain([egui::FontFamily::Name("arabic".into()), egui::FontFamily::Name("arabic-semibold".into())]) {
                let font = egui::FontId::new(13.0, family);
                assert!(fonts.has_glyph(&font, 'ד') && fonts.has_glyph(&font, 'क'), "missing supplied script in {font:?}");
                let galley = fonts.layout_no_wrap("דक".into(), font, egui::Color32::WHITE);
                assert!(galley.size().x > 0.0 && galley.rect.is_finite());
            }
        });
    }

    #[test]
    fn japanese_ui_glyphs_are_available_in_every_family() {
        if designcraft_fonts::CRAFT_FONTS.is_empty() {
            eprintln!("skipped: built without craft-fonts (set CRAFT_FONTS_DIR to a checkout)");
            return;
        }
        let ctx = ctx_with(designcraft_fonts::CRAFT_FONTS);
        ctx.fonts_mut(|fonts| {
            for family in families() {
                let font = egui::FontId::new(13.0, family);
                // Real glyphs (no tofu) for every character.
                for ch in "日本語の文字縦書き横書き組み方向ルビ圏点".chars() {
                    assert!(fonts.has_glyph(&font, ch), "missing {ch} in {font:?}");
                }
            }
        });
        // The UI face is BIZ UDPGothic, ahead of the Mincho faces.
        let defs = super::font_definitions(designcraft_fonts::CRAFT_FONTS, "ja");
        let stack = &defs.families[&egui::FontFamily::Proportional];
        assert_eq!(stack.iter().find(|n| n.starts_with("craft-")).map(String::as_str), Some("craft-BIZ UDPGothic-Regular"));
    }

    /// Without craft-fonts, an installed Japanese face gives the interface its glyphs (here a
    /// synthetic stand-in, so the test doesn't depend on the machine's fonts).
    #[test]
    fn installed_fonts_give_japanese_glyphs_without_craft_fonts() {
        let bytes = designcraft_fonts::testing::font_with("DC UI Japanese", &['日', '本', '語']).unwrap();
        let system = [super::SystemFont::new("Jpan", "DC UI Japanese".into(), bytes, 0)];
        let mut defs = super::font_definitions(&[], "ja");
        super::add_system_fallbacks(&mut defs, &system, "ja");
        for family in families() {
            assert_eq!(defs.families[&family].last().map(String::as_str), Some("system-DC UI Japanese"), "{family:?}");
        }
        let ctx = egui::Context::default();
        ctx.set_fonts(defs);
        let mut output = ctx.run_ui(egui::RawInput::default(), |_| {});
        output.textures_delta.clear();
        ctx.fonts_mut(|fonts| {
            let font = egui::FontId::new(13.0, egui::FontFamily::Proportional);
            for ch in "日本語".chars() {
                assert!(fonts.has_glyph(&font, ch), "missing {ch}");
            }
        });
    }

    /// A fallback face with other line metrics lands on the UI face's baseline: egui puts a glyph
    /// at `ascent + (primary line height − its line height) / 2`, plus the tweak.
    #[test]
    fn fallback_faces_share_the_ui_baseline() {
        let ui = designcraft_fonts::line_metrics(super::UI_FONT, 0).unwrap();
        // A synthetic face with a taller ascent and a line gap (Hiragino-like proportions).
        let base = designcraft_fonts::testing::font_with("DC Tall", &['日']).unwrap();
        let tall = designcraft_fonts::testing::with_table_u16(base, b"hhea", 4, 1200u16).unwrap();
        let tall = designcraft_fonts::testing::with_table_u16(tall, b"hhea", 8, 500u16).unwrap();
        let face = designcraft_fonts::line_metrics(&tall, 0).unwrap();
        let tweak = super::baseline_tweak(&tall, 0);
        let em = |m: (f32, f32, f32, f32)| (m.1 / m.0, (m.1 - m.2 + m.3) / m.0);
        let ((ap, hp), (af, hf)) = (em(ui), em(face));
        let baseline = af + 0.5 * (hp - hf) + tweak.y_offset_factor;
        assert!((baseline - ap).abs() < 1e-4, "{baseline} vs {ap}");
        assert!(tweak.y_offset_factor.abs() > 0.01, "the synthetic face needs a shift: {}", tweak.y_offset_factor);
        // The UI face itself needs no shift.
        assert!(super::baseline_tweak(super::UI_FONT, 0).y_offset_factor.abs() < 1e-6);
    }

    /// Korean font names (the font menus show Korean families by their Hangul names) get glyphs
    /// from an installed Korean face, after the Japanese and Chinese ones.
    #[test]
    fn installed_korean_faces_give_hangul_glyphs() {
        let face = |family: &str, chars: &[char], script| {
            super::SystemFont::new(script, family.into(), designcraft_fonts::testing::font_with(family, chars).unwrap(), 0)
        };
        let system = [face("DC UI Korean", &['한', '글'], "Kore"), face("DC UI Japanese", &['日'], "Jpan")];
        let mut defs = super::font_definitions(&[], "ja");
        super::add_system_fallbacks(&mut defs, &system, "ja");
        let stack = &defs.families[&egui::FontFamily::Proportional];
        let at = |n: &str| stack.iter().position(|x| x == n).unwrap();
        assert!(at("system-DC UI Japanese") < at("system-DC UI Korean"));
        let ctx = egui::Context::default();
        ctx.set_fonts(defs);
        let mut output = ctx.run_ui(egui::RawInput::default(), |_| {});
        output.textures_delta.clear();
        ctx.fonts_mut(|fonts| {
            let font = egui::FontId::new(13.0, egui::FontFamily::Proportional);
            assert!(fonts.has_glyph(&font, '한') && fonts.has_glyph(&font, '글'));
        });
    }

    /// Han characters take the interface language's forms: its script's installed face comes
    /// before the built-in CJK faces and the other scripts' faces.
    #[test]
    fn interface_language_orders_the_cjk_faces() {
        let face =
            |family: &str, script| super::SystemFont::new(script, family.into(), designcraft_fonts::testing::font_with(family, &['日']).unwrap(), 0);
        let system = [face("DC Ja", "Jpan"), face("DC Hans", "Hans"), face("DC Hant", "Hant"), face("DC Ko", "Kore")];
        for (lang, first) in [("ja", "DC Ja"), ("zh", "DC Hans"), ("zh-hant", "DC Hant"), ("ko", "DC Ko"), ("", "DC Ja")] {
            let mut defs = super::font_definitions(&[], lang);
            // Stand-in for a built-in CJK face (craft-fonts may be absent in this build).
            defs.families.entry(egui::FontFamily::Proportional).or_default().push("craft-Stand-in".into());
            super::add_system_fallbacks(&mut defs, &system, lang);
            let stack = &defs.families[&egui::FontFamily::Proportional];
            let at = |n: &str| stack.iter().position(|x| x == n).unwrap();
            let first_at = at(&format!("system-{first}"));
            assert!(first_at < at("craft-Stand-in"), "{lang}: {stack:?}");
            for f in &system {
                let name = format!("system-{}", f.family);
                assert!(first_at <= at(&name), "{lang}: {stack:?}");
                // Another language shares the face's data instead of copying the font file.
                assert!(std::sync::Arc::ptr_eq(&defs.font_data[&name], &f.data), "{lang}: {name}");
            }
        }
    }

    /// Tamil, Devanagari and Thai text get glyphs from installed faces, found by family and
    /// checked for coverage, after the CJK faces. Synthetic fonts in a folder of their own stand
    /// in for the machine's.
    #[test]
    fn installed_faces_give_other_scripts_glyphs_after_the_cjk_faces() {
        let dir = std::env::temp_dir().join(format!("dc-ui-script-fonts-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let fonts = [
            ("Noto Sans CJK JP", &['あ', '日'][..]),
            // Listed first for Tamil but without Tamil glyphs: passed over.
            ("Tamil Sangam MN", &['a'][..]),
            // One face for two scripts is added once.
            ("Nirmala UI", &['த', 'க', 'क'][..]),
            ("Noto Sans Thai", &['ก'][..]),
        ];
        for (i, (family, chars)) in fonts.iter().enumerate() {
            std::fs::write(dir.join(format!("font{i}.ttf")), designcraft_fonts::testing::font_with(family, chars).unwrap()).unwrap();
        }
        let db = designcraft_fonts::FontDb::with_font_dirs(vec![dir.clone()]);
        let system = super::installed_ui_fonts(&db, &[]);
        let _ = std::fs::remove_dir_all(&dir);
        let picked: Vec<(&str, &str)> = system.iter().map(|f| (f.script, f.family.as_str())).collect();
        assert_eq!(picked, [("Jpan", "Noto Sans CJK JP"), ("Taml", "Nirmala UI"), ("Thai", "Noto Sans Thai")]);

        let mut defs = super::font_definitions(&[], "ja");
        defs.families.entry(egui::FontFamily::Proportional).or_default().push("craft-Stand-in".into());
        super::add_system_fallbacks(&mut defs, &system, "ja");
        let stack = &defs.families[&egui::FontFamily::Proportional];
        let at = |n: &str| stack.iter().position(|x| x == n).unwrap();
        assert!(at("system-Noto Sans CJK JP") < at("craft-Stand-in"), "{stack:?}");
        assert!(at("craft-Stand-in") < at("system-Nirmala UI") && at("system-Nirmala UI") < at("system-Noto Sans Thai"), "{stack:?}");
        defs.families.entry(egui::FontFamily::Proportional).or_default().retain(|n| n != "craft-Stand-in");
        let ctx = egui::Context::default();
        ctx.set_fonts(defs);
        let mut output = ctx.run_ui(egui::RawInput::default(), |_| {});
        output.textures_delta.clear();
        ctx.fonts_mut(|fonts| {
            let font = egui::FontId::new(13.0, egui::FontFamily::Proportional);
            for ch in ['த', 'क', 'ก'] {
                assert!(fonts.has_glyph(&font, ch), "missing {ch}");
            }
        });
    }

    #[test]
    fn ui_works_without_craft_fonts() {
        let ctx = ctx_with(&[]);
        ctx.fonts_mut(|fonts| {
            // (egui's has_glyph reports false for characters of the face that also supplies the
            // replacement glyph, as Source Sans Semibold does in the semibold stack.)
            let body = egui::FontId::new(13.0, egui::FontFamily::Proportional);
            assert!(fonts.has_glyphs(&body, "DesignCraft"));
            for family in families() {
                let font = egui::FontId::new(13.0, family);
                let galley = fonts.layout_no_wrap("日本語 DesignCraft".into(), font, egui::Color32::WHITE);
                assert!(galley.size().x > 0.0);
            }
        });
        // And the real installer works with whatever this build has.
        super::install_fonts(&egui::Context::default(), "ja");
    }
}

#[cfg(test)]
mod ukrainian_font_tests {
    #[test]
    fn every_catalog_cyrillic_glyph_exists_in_the_bundled_ui_fonts() {
        // Check the actual installed face data, without craft-fonts or system fonts.
        // egui's has_glyph can report false for the face providing its replacement glyph.
        let definitions = super::font_definitions(&[], "uk");
        let db = designcraft_fonts::FontDb::with_font_dirs(Vec::new());
        db.set_system_fallback(false);
        let characters: std::collections::HashSet<_> = crate::i18n::ukrainian_catalog()
            .iter()
            .flat_map(|text| text.chars())
            .chain("ҐґЄєІіЇї".chars())
            .filter(|c| matches!(*c, '\u{0400}'..='\u{052f}'))
            .collect();
        for (name, family, style) in
            [("ui", "Source Sans 3", "Regular"), ("ui-semibold", "Source Sans 3", "Semibold"), ("mono", "JetBrains Mono", "Regular")]
        {
            let data = definitions.font_data[name].bytes();
            let face = db.face(family, style);
            assert_eq!(face.data(), data, "configured UI face {name}");
            for character in &characters {
                assert_ne!(face.glyph_for(*character), 0, "missing {character} in {name}");
            }
        }
    }
}

#[cfg(test)]
mod russian_font_tests {
    #[test]
    fn every_catalog_cyrillic_glyph_exists_in_the_bundled_ui_fonts() {
        // Same check as for Ukrainian: the installed face data only, without craft-fonts or system fonts.
        let definitions = super::font_definitions(&[], "ru");
        let db = designcraft_fonts::FontDb::with_font_dirs(Vec::new());
        db.set_system_fallback(false);
        let characters: std::collections::HashSet<_> = crate::i18n::russian_catalog()
            .iter()
            .flat_map(|text| text.chars())
            .chain("АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя".chars())
            .filter(|c| matches!(*c, '\u{0400}'..='\u{052f}'))
            .collect();
        for (name, family, style) in
            [("ui", "Source Sans 3", "Regular"), ("ui-semibold", "Source Sans 3", "Semibold"), ("mono", "JetBrains Mono", "Regular")]
        {
            let data = definitions.font_data[name].bytes();
            let face = db.face(family, style);
            assert_eq!(face.data(), data, "configured UI face {name}");
            for character in &characters {
                assert_ne!(face.glyph_for(*character), 0, "missing {character} in {name}");
            }
        }
    }
}

#[cfg(test)]
mod readout_tests {
    use super::{Brightness, Tokens};

    fn luminance(c: egui::Color32) -> f32 {
        let lin = |v: u8| {
            let v = v as f32 / 255.0;
            if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) }
        };
        0.2126 * lin(c.r()) + 0.7152 * lin(c.g()) + 0.0722 * lin(c.b())
    }

    fn contrast(a: egui::Color32, b: egui::Color32) -> f32 {
        let (x, y) = (luminance(a), luminance(b));
        (x.max(y) + 0.05) / (x.min(y) + 0.05)
    }

    /// The readout beside the cursor ("W: 3.13 cm" while drawing a frame) is InDesign's light
    /// grey box in every brightness, with text that stays readable on it; High Contrast keeps
    /// it black.
    #[test]
    fn the_cursor_readout_is_indesigns_light_grey_with_readable_text() {
        for b in [Brightness::Dark, Brightness::MediumDark, Brightness::MediumLight, Brightness::Light] {
            let t = Tokens::for_brightness(b);
            assert_eq!(t.readout_bg, egui::Color32::from_rgb(0xa8, 0xa8, 0xa8), "{b:?}");
            assert!(contrast(t.readout_text, t.readout_bg) >= 4.5, "{b:?}");
        }
        let hc = Tokens::for_brightness(Brightness::HighContrast);
        assert_eq!(hc.readout_bg, egui::Color32::BLACK);
        assert!(contrast(hc.readout_text, hc.readout_bg) >= 4.5);
    }
}
