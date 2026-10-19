// Adaptateur OpenNext pour Cloudflare Workers. Toutes les pages sont dynamiques (ni ISR ni cache de données) :
// aucun cache incrémental n'est nécessaire.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
