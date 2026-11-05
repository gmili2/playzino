import { BlockList, isIPv4 } from 'node:net';

/**
 * Plages d'adresses de Cloudflare (https://www.cloudflare.com/ips/), qui sert le site devant le serveur web.
 * À mettre à jour si Cloudflare en publie de nouvelles (une plage manquante ferait simplement voir l'adresse
 * de Cloudflare au lieu de celle du joueur, sans risque de sécurité).
 */
const CLOUDFLARE_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'
];
const CLOUDFLARE_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'];

const cloudflare = new BlockList();
for (const r of CLOUDFLARE_V4) { const [a, n] = r.split('/'); cloudflare.addSubnet(a, Number(n), 'ipv4'); }
for (const r of CLOUDFLARE_V6) { const [a, n] = r.split('/'); cloudflare.addSubnet(a, Number(n), 'ipv6'); }

const isCloudflare = (addr: string) => {
  const v4 = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
  return isIPv4(v4) ? cloudflare.check(v4, 'ipv4') : cloudflare.check(addr, 'ipv6');
};

/**
 * Réglage « trust proxy » d'Express : le serveur web local (1er saut) est toujours de confiance, puis les relais
 * Cloudflare. req.ip est ainsi l'adresse du joueur (limite de tentatives de connexion, journal), et un en-tête
 * X-Forwarded-For falsifié par un client ne peut pas la remplacer : seule une adresse Cloudflare est sautée.
 */
export const trustProxy = (addr: string, hop: number) => hop === 0 || isCloudflare(addr);
