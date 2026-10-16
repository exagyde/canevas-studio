// Contrôles d'URL pour les proxys serveur.

const DATAVERSE_HOST = /\.(crm\d*\.dynamics\.com|crm\d*\.microsoftdynamics\.(us|de)|crm\.dynamics\.cn|crm\.appsplatform\.us)$/i;

/** URL d'environnement Dataverse (https://org.crmX.dynamics.com) */
export function checkDataverseUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || !DATAVERSE_HOST.test(u.hostname)) return null;
    return `https://${u.hostname}`;
  } catch {
    return null;
  }
}

const FLOW_HOST = /(\.logic\.azure\.com|\.powerplatform\.com|\.azure-apim\.net|\.powerautomate\.com)$/i;

/** URL de déclencheur HTTP Power Automate / Logic Apps */
export function checkFlowUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || !FLOW_HOST.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
