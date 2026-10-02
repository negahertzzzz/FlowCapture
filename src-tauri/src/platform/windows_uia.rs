#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UIElementMetadata {
    pub name: String,
    pub control_type: String,
    pub localized_type: String,
    pub class_name: Option<String>,
}

#[cfg(target_os = "windows")]
pub fn get_element_at_point(x: i32, y: i32) -> Option<UIElementMetadata> {
    use uiautomation::types::Point;
    use uiautomation::UIAutomation;

    let automation = UIAutomation::new().ok()?;
    let point = Point::new(x, y);
    let element = automation.element_from_point(point).ok()?;

    let name = element.get_name().unwrap_or_default().trim().to_string();
    let control_type = element
        .get_control_type()
        .map(|ct| format!("{ct:?}"))
        .unwrap_or_default();
    let localized_type = element
        .get_localized_control_type()
        .unwrap_or_default()
        .trim()
        .to_string();
    let class_name = element
        .get_classname()
        .ok()
        .filter(|s| !s.trim().is_empty());

    if name.is_empty() && localized_type.is_empty() {
        return None;
    }

    Some(UIElementMetadata {
        name,
        control_type,
        localized_type,
        class_name,
    })
}

#[cfg(not(target_os = "windows"))]
pub fn get_element_at_point(_x: i32, _y: i32) -> Option<UIElementMetadata> {
    None
}

/// Tells whether the element that currently has keyboard focus is a password field,
/// so keystrokes typed into it can be masked before they are stored.
/// Holds one UI Automation client per thread (COM objects are thread-bound).
pub struct PasswordFieldDetector {
    #[cfg(target_os = "windows")]
    automation: Option<uiautomation::UIAutomation>,
}

impl PasswordFieldDetector {
    pub fn new() -> Self {
        Self {
            #[cfg(target_os = "windows")]
            automation: uiautomation::UIAutomation::new().ok(),
        }
    }

    #[cfg(target_os = "windows")]
    pub fn focused_is_password(&self) -> bool {
        self.automation
            .as_ref()
            .and_then(|automation| automation.get_focused_element().ok())
            .and_then(|element| element.is_password().ok())
            .unwrap_or(false)
    }

    #[cfg(not(target_os = "windows"))]
    pub fn focused_is_password(&self) -> bool {
        false
    }
}
