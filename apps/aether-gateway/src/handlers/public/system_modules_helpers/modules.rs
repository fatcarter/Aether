use crate::handlers::shared::{module_available_from_env, system_config_bool};
use crate::{AppState, GatewayError};
use serde_json::json;

#[derive(Clone, Copy)]
struct PublicAuthModuleDefinition {
    name: &'static str,
    display_name: &'static str,
    env_key: &'static str,
    default_available: bool,
}

const PUBLIC_AUTH_MODULE_DEFINITIONS: &[PublicAuthModuleDefinition] = &[
    PublicAuthModuleDefinition {
        name: "oauth",
        display_name: "OAuth 登录",
        env_key: "OAUTH_AVAILABLE",
        default_available: true,
    },
    PublicAuthModuleDefinition {
        name: "ldap",
        display_name: "LDAP 认证",
        env_key: "LDAP_AVAILABLE",
        default_available: true,
    },
];

/// 面向普通用户暴露的扩展模块定义。
///
/// 这些模块会在用户侧界面（如左侧菜单）根据启用状态显示，因此需要一个无需管理员
/// 权限即可访问的公开状态查询入口。此处只包含 `active` 布尔值，不泄漏任何渠道、
/// 配置或运行时细节。`active` 的判定与管理端一致：环境可用 && 系统配置启用。
struct PublicUserModuleDefinition {
    name: &'static str,
    env_key: &'static str,
    default_available: bool,
}

const PUBLIC_USER_MODULE_DEFINITIONS: &[PublicUserModuleDefinition] = &[PublicUserModuleDefinition {
    name: "model_plaza",
    env_key: "MODEL_PLAZA_AVAILABLE",
    default_available: true,
}];

pub(crate) fn oauth_module_config_is_valid(
    providers: &[aether_data::repository::auth_modules::StoredOAuthProviderModuleConfig],
) -> bool {
    !providers.is_empty()
        && providers.iter().all(|provider| {
            !provider.client_id.trim().is_empty()
                && provider
                    .client_secret_encrypted
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .is_some()
                && !provider.redirect_uri.trim().is_empty()
        })
}

pub(crate) fn ldap_module_config_is_valid(
    config: Option<&aether_data::repository::auth_modules::StoredLdapModuleConfig>,
) -> bool {
    crate::handlers::shared::ldap_module_config_is_valid(config)
}

pub(crate) async fn build_public_auth_modules_status_payload(
    state: &AppState,
) -> Result<serde_json::Value, GatewayError> {
    let oauth_providers = state.list_enabled_oauth_module_providers().await?;
    let ldap_config = state.get_ldap_module_config().await?;
    let oauth_active = oauth_module_config_is_valid(&oauth_providers);
    let ldap_active = ldap_module_config_is_valid(ldap_config.as_ref());

    let mut items = Vec::new();
    for module in PUBLIC_AUTH_MODULE_DEFINITIONS {
        if !module_available_from_env(module.env_key, module.default_available) {
            continue;
        }
        let enabled = state
            .read_system_config_json_value(&format!("module.{}.enabled", module.name))
            .await
            .ok()
            .flatten();
        let enabled = system_config_bool(enabled.as_ref(), false);
        let active = match module.name {
            "oauth" => enabled && oauth_active,
            "ldap" => enabled && ldap_active,
            _ => false,
        };
        items.push(json!({
            "name": module.name,
            "display_name": module.display_name,
            "active": active,
        }));
    }

    Ok(serde_json::Value::Array(items))
}

/// 构建面向普通用户的扩展模块启用状态列表。
///
/// 供公开接口 `GET /api/modules/user-status` 使用，用户侧据此决定是否展示对应菜单。
/// 返回形如 `[{ "name": "model_plaza", "active": true }]`，只暴露启用与否。
pub(crate) async fn build_public_user_modules_status_payload(
    state: &AppState,
) -> Result<serde_json::Value, GatewayError> {
    let mut items = Vec::new();
    for module in PUBLIC_USER_MODULE_DEFINITIONS {
        if !module_available_from_env(module.env_key, module.default_available) {
            items.push(json!({ "name": module.name, "active": false }));
            continue;
        }
        let enabled = state
            .read_system_config_json_value(&format!("module.{}.enabled", module.name))
            .await
            .ok()
            .flatten();
        let active = system_config_bool(enabled.as_ref(), false);
        items.push(json!({ "name": module.name, "active": active }));
    }

    Ok(serde_json::Value::Array(items))
}
