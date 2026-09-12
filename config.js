/* One7One Timesheet environment configuration. */
(function () {
  const SHARED_SUPABASE_URL="https://cebgyyairqctbgrocxgl.supabase.co";
  const SHARED_SUPABASE_KEY="sb_publishable_VFT7GrL1rJtmV0hv0CPrlg_qjZXq4PT";
  const environments = {
    production: {environment:"production",isDevelopment:false,supabaseUrl:SHARED_SUPABASE_URL,supabaseKey:SHARED_SUPABASE_KEY,pageTitle:"Café Staff Timesheet",appHeading:"Staff Timesheet",buildLabel:"",modeSuffix:"",manifestFile:"manifest-production.json",versionSuffix:""},
    development: {environment:"development",isDevelopment:true,supabaseUrl:SHARED_SUPABASE_URL,supabaseKey:SHARED_SUPABASE_KEY,pageTitle:"DEV — Café Staff Timesheet",appHeading:"Staff Timesheet",buildLabel:"⚠ DEV BUILD",modeSuffix:" • DEV",manifestFile:"manifest-dev.json",versionSuffix:"-dev"}
  };
  function detectEnvironment(){const saved=localStorage.getItem("171-timesheet-environment");if(saved==="development"||saved==="production")return saved;const text=`${location.hostname}${location.pathname}`.toLowerCase();return text.includes("dev-171-timesheet")?"development":"production"}
  const selected=detectEnvironment();window.TIMESHEET_ENV=selected;window.APP_CONFIG=Object.freeze(environments[selected]);

  /*
    DEV and LIVE now share one Supabase project, but DEV is isolated behind
    dev_ tables/RPCs/functions. Rewrite only DEV Supabase API requests so the
    existing application code can never address the LIVE objects by mistake.
  */
  if(selected==="development"){
    const originalFetch=window.fetch.bind(window);
    const devTables=new Set(["staff_members","timesheets","audit_log","manager_pin_sessions","user_pin_sessions","promotion_entries","promotion_draws","push_subscriptions","notification_log","push_vapid_config","notification_settings","automatic_reminder_runs"]);
    const edgeMap={
      "send-timesheet-notification":"dev-send-timesheet-notification",
      "automatic-timesheet-reminders":"dev-automatic-timesheet-reminders",
      "notify-timesheet-owner":"dev-notify-timesheet-owner"
    };
    window.fetch=function(input,init){
      try{
        const raw=typeof input==="string"?input:input instanceof URL?input.toString():input?.url;
        if(raw){
          const u=new URL(raw,window.location.href);
          if(u.origin===new URL(SHARED_SUPABASE_URL).origin){
            const tableMatch=u.pathname.match(/^\/rest\/v1\/([^/]+)$/);
            const rpcMatch=u.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/);
            const edgeMatch=u.pathname.match(/^\/functions\/v1\/([^/]+)$/);
            if(tableMatch&&devTables.has(decodeURIComponent(tableMatch[1]))){
              u.pathname=`/rest/v1/dev_${tableMatch[1]}`;
            }else if(rpcMatch&&!decodeURIComponent(rpcMatch[1]).startsWith("dev_")){
              u.pathname=`/rest/v1/rpc/dev_${rpcMatch[1]}`;
            }else if(edgeMatch&&edgeMap[decodeURIComponent(edgeMatch[1])]){
              u.pathname=`/functions/v1/${edgeMap[decodeURIComponent(edgeMatch[1])]}`;
            }
            const nextUrl=u.toString();
            if(typeof input==="string"||input instanceof URL)return originalFetch(nextUrl,init);
            if(input instanceof Request)return originalFetch(new Request(nextUrl,input),init);
          }
        }
      }catch(error){console.error("DEV Supabase routing error:",error);throw error}
      return originalFetch(input,init);
    };
  }

  window.switchTimesheetEnvironment=function(environment){if(environment==="auto"){localStorage.removeItem("171-timesheet-environment");location.reload();return}if(!environments[environment])throw new Error('Use "development", "production", or "auto".');localStorage.setItem("171-timesheet-environment",environment);location.reload()};
  window.addEventListener("DOMContentLoaded",()=>{for(const file of ["promotion-admin.js","notifications.js","notification-settings.js","timesheet-safeguards.js","did-not-work.js"]){const s=document.createElement("script");s.src=`${file}?v=${Date.now()}`;document.body.appendChild(s)}});
})();