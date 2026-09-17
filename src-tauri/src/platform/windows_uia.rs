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
