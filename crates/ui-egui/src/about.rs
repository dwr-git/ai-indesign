//! Help › About AI-InDesign: tabs About · Contributors · Models. About shows a neutral mark drawn
//! in code, the version and where the app comes from (DesignCraft by the ArtCraft team); AI-InDesign
//! works offline, so it has no links out of the page. Contributors and Models are the compiled-in
//! credits (`crate::credits`).

use egui::{Color32, Rect, Sense, Stroke, pos2, vec2};

use crate::DesignApp;
use crate::theme::{Tokens, semibold};

/// The About window's tabs, in `UiState::about_tab` order (`help.about {tab}` names them in lowercase).
pub const ABOUT_TABS: [&str; 3] = ["About", "Contributors", "Models"];

/// AI-InDesign's mark, drawn in code: a page with a headline, two columns of text and a picture
/// frame, on an accent tile.
pub fn paint_mark(ui: &egui::Ui, rect: Rect, accent: Color32) {
    let p = ui.painter();
    let side = rect.width().min(rect.height());
    let r = Rect::from_center_size(rect.center(), vec2(side, side));
    p.rect_filled(r, side * 0.22, accent);
    let page = Rect::from_center_size(r.center(), vec2(side * 0.52, side * 0.66));
    p.rect_filled(page, side * 0.04, Color32::WHITE);
    let ink = Color32::from_rgb(0x2B, 0x33, 0x55);
    let u = page.width() / 10.0;
    p.rect_filled(Rect::from_min_size(page.min + vec2(u, u), vec2(u * 8.0, u * 1.3)), 1.0, ink);
    let pic = Rect::from_min_size(page.min + vec2(u, u * 3.0), vec2(u * 3.6, u * 3.0));
    p.rect_filled(pic, 1.0, accent.gamma_multiply(0.55));
    for i in 0..4 {
        let y = page.min.y + u * (3.4 + 1.1 * i as f32);
        p.line_segment([pos2(page.min.x + u * 5.4, y), pos2(page.max.x - u, y)], Stroke::new(u * 0.45, ink));
    }
    for i in 0..3 {
        let y = page.min.y + u * (7.4 + 1.1 * i as f32);
        p.line_segment([pos2(page.min.x + u, y), pos2(page.max.x - u, y)], Stroke::new(u * 0.45, ink));
    }
}

pub fn show(app: &mut DesignApp, ctx: &egui::Context) {
    if !app.ui.about {
        return;
    }
    let t = Tokens::get(ctx);
    let area = egui::Id::unique("about");
    let instance = area.with("placement");
    let resp = crate::modal_drag::modal(ctx, area, instance).show(ctx, |ui| {
        ui.set_width(if app.ui.about_tab == 0 { 460.0 } else { 820.0_f32.min(ctx.content_rect().width() - 40.0).max(460.0) });
        // The tab row is the title row. The tabs register after the drag area, so they stay clickable.
        let margin = egui::Frame::popup(ui.style()).inner_margin;
        let top = ui.cursor().top();
        let title_row = Rect::from_min_max(
            pos2(ui.max_rect().left() - margin.leftf(), top - margin.topf()),
            pos2(ui.max_rect().right() + margin.rightf(), top + ui.spacing().interact_size.y),
        );
        crate::modal_drag::title_drag(ui, instance, title_row);
        ui.horizontal(|ui| {
            for (i, l) in ABOUT_TABS.iter().enumerate() {
                let i = i as u8;
                if ui.selectable_label(app.ui.about_tab == i, crate::rtl::widget(ui, crate::i18n::tr(&app.ui.language, l))).clicked() {
                    app.ui.about_tab = i;
                }
            }
        });
        ui.separator();
        if app.ui.about_tab != 0 {
            let h = 400.0_f32.min(ctx.content_rect().height() * 0.7).max(160.0);
            ui.allocate_ui_with_layout(vec2(ui.available_width(), h), egui::Layout::top_down(egui::Align::Min), |ui| {
                ui.set_min_height(h);
                if app.ui.about_tab == 1 {
                    crate::credits::contributors_ui(ui, &app.ui.language);
                } else {
                    crate::credits::models_ui(ui, &app.ui.language);
                }
            });
            ui.separator();
            ui.vertical_centered(|ui| {
                if ui.button(crate::rtl::widget(ui, crate::i18n::tr(&app.ui.language, "  Close  "))).clicked() {
                    app.ui.about = false;
                }
            });
            return;
        }
        ui.vertical_centered(|ui| {
            ui.add_space(8.0);
            let (r, _) = ui.allocate_exact_size(vec2(72.0, 72.0), Sense::hover());
            paint_mark(ui, r, t.accent);
            ui.add_space(6.0);
            ui.label(crate::rtl::widget(ui, egui::RichText::new("AI-InDesign").font(semibold(26.0)).color(t.text_strong)));
            crate::rtl::label(
                ui,
                egui::RichText::new(format!("{} {}", crate::i18n::tr(&app.ui.language, "Version"), env!("CARGO_PKG_VERSION")))
                    .size(12.0)
                    .color(t.text_dim),
            );
            ui.add_space(4.0);
            ui.label(crate::rtl::widget(
                ui,
                egui::RichText::new(crate::i18n::tr(&app.ui.language, "Page layout for print and screen — fast, open and scriptable."))
                    .size(13.0)
                    .color(t.text),
            ));
            ui.add_space(8.0);
            ui.label(crate::rtl::widget(
                ui,
                egui::RichText::new(crate::i18n::tr(
                    &app.ui.language,
                    "Based on DesignCraft by the ArtCraft team (github.com/storytold/designcraft).",
                ))
                .size(12.0)
                .color(t.text_dim),
            ));
            ui.label(crate::rtl::widget(
                ui,
                egui::RichText::new(crate::i18n::tr(
                    &app.ui.language,
                    "MIT OR Apache-2.0. Copyright (c) 2026 ArtCraft Team, the DesignCraft and AI-InDesign contributors.",
                ))
                .size(11.0)
                .color(t.text_dim),
            ));
            ui.add_space(12.0);
            ui.label(crate::rtl::widget(
                ui,
                egui::RichText::new(crate::i18n::tr(&app.ui.language, "Open source. No telemetry.")).size(11.0).color(t.text_dim),
            ));
            ui.add_space(8.0);
            if ui.button(crate::rtl::widget(ui, crate::i18n::tr(&app.ui.language, "  Close  "))).clicked() {
                app.ui.about = false;
            }
        });
    });
    if resp.should_close() {
        app.ui.about = false;
    }
}
