import type { FastifyInstance } from 'fastify';

/**
 * 公开隐私政策页面（无需登录）。
 * 返回响应式 HTML，手机与桌面均可正常阅读。
 *
 * 注意：SUPPORT_EMAIL 是正式支持邮箱，务必填写真实邮箱后再部署（禁止伪造）。
 */
const SUPPORT_EMAIL = 'qianjin2700@gmail.com';

export function registerPrivacyRoutes(app: FastifyInstance): void {
  app.get(
    '/privacy',
    { schema: { tags: ['system'] } },
    async (_request, reply) => {
      return reply.type('text/html; charset=utf-8').send(renderPrivacyHtml());
    },
  );
}

function renderPrivacyHtml(): string {
  const email = SUPPORT_EMAIL.trim();
  const contactLine = email
    ? `Email: <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
    : 'Email: <span class="placeholder">[待提供支持邮箱]</span>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trailogue Privacy Policy</title><style>
*{box-sizing:border-box}
body{margin:0;background:#f7f4ee;color:#24211d;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;line-height:1.75;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:44px 20px 96px}
header{border-bottom:1px solid #d8cdbe;padding-bottom:26px;margin-bottom:8px}
h1{font-size:2rem;line-height:1.2;margin:0 0 10px;letter-spacing:-.02em}
.effective{color:#655f57;font-size:.95rem;margin:0}
h2{font-size:1.25rem;margin:38px 0 10px;color:#7d5c3c}
p{margin:0 0 14px;color:#29251f}
ul{margin:0 0 14px;padding-left:22px}
li{margin:6px 0}
a{color:#7d5c3c}
.contact{background:#fff;border:1px solid #d8cdbe;border-radius:12px;padding:22px 26px;margin-top:10px}
.contact p{margin:4px 0}
.placeholder{color:#a33b2b}
@media (max-width:600px){h1{font-size:1.6rem}h2{font-size:1.15rem}}
</style></head><body><div class="wrap">
<header><h1>Trailogue Privacy Policy</h1><p class="effective">Effective Date: November 3, 2026</p></header>

<p>Trailogue (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the App&rdquo;) respects your privacy. This Privacy Policy explains how Trailogue collects, uses, stores, and processes information when you use the Trailogue iOS application and related sharing services.</p>

<h2>1. Information We Collect</h2>
<p>When you use Trailogue, we may collect:</p>
<ul>
<li>your name, if provided by Apple during your first Sign in with Apple authorization;</li>
<li>your email address, including an Apple private relay email address where applicable;</li>
<li>your Apple account identifier and Trailogue user identifier;</li>
<li>photos you choose to upload;</li>
<li>trip titles, destinations, dates, notes, descriptions, story text, and related travel content.</li>
</ul>
<p>We do not collect phone numbers, precise device location, contacts, advertising identifiers, health data, financial information, or browsing history.</p>

<h2>2. How We Use Information</h2>
<p>We use this information only to provide Trailogue functionality, including:</p>
<ul>
<li>authenticating your account;</li>
<li>storing and displaying trips;</li>
<li>uploading and retrieving photos;</li>
<li>generating travel stories;</li>
<li>creating Story and Magazine views;</li>
<li>generating PDF travel books;</li>
<li>creating and managing private sharing links;</li>
<li>maintaining account and service security.</li>
</ul>
<p>We do not use personal information for advertising or cross-app tracking.</p>

<h2>3. AI Processing</h2>
<p>Trailogue uses artificial intelligence services to analyze selected travel photos and generate travel stories.</p>
<p>Photos, trip information, notes, and related content may be transmitted to AI service providers, including DeepSeek, when necessary to provide these features.</p>
<p>AI processing is used only to provide Trailogue functionality.</p>

<h2>4. Service Providers</h2>
<p>Trailogue currently uses third-party service providers, including:</p>
<ul>
<li>Apple for Sign in with Apple and App Store services;</li>
<li>Railway for application hosting and backend services;</li>
<li>Neon for database infrastructure;</li>
<li>Cloudflare R2 for private photo and file storage;</li>
<li>DeepSeek for AI-assisted photo analysis and story generation.</li>
</ul>
<p>These providers may process information only as necessary to provide their respective services.</p>

<h2>5. Sharing</h2>
<p>Trailogue allows users to create sharing links for Story and Magazine views.</p>
<p>Anyone who receives a valid sharing link may be able to view the content available through that link. Users should share links only with people they intend to give access to.</p>

<h2>6. Data Retention and Deletion</h2>
<p>We retain account and travel data as necessary to provide Trailogue.</p>
<p>Users can delete individual trips and photos within the App. Users can also delete their Trailogue account and associated data from within the App.</p>
<p>Some limited technical information may be retained where necessary for security, legal, or operational purposes.</p>

<h2>7. Tracking and Advertising</h2>
<p>Trailogue does not:</p>
<ul>
<li>display third-party advertising;</li>
<li>use advertising identifiers;</li>
<li>sell personal information;</li>
<li>use personal information for cross-app tracking;</li>
<li>share personal information with data brokers.</li>
</ul>

<h2>8. Children</h2>
<p>Trailogue is not specifically directed to children.</p>

<h2>9. Security</h2>
<p>We use reasonable technical safeguards, including authenticated access, private storage, and signed URLs, to protect user information.</p>

<h2>10. International Processing</h2>
<p>Information may be processed or stored in countries or regions other than the user&rsquo;s country of residence through our service providers.</p>

<h2>11. Your Rights</h2>
<p>Depending on applicable law, users may have rights to access, correct, or delete their personal information.</p>

<h2>12. Changes to This Policy</h2>
<p>We may update this Privacy Policy from time to time. The effective date above will be updated when material changes are made.</p>

<h2>13. Contact</h2>
<p>For privacy questions or requests, contact:</p>
<div class="contact">
<p><strong>Trailogue Support</strong></p>
<p>${contactLine}</p>
</div>

</div></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]!);
}
