import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const mono = "'Share Tech Mono',monospace";
const orb  = "'Orbitron',sans-serif";
const raj  = "'Rajdhani',sans-serif";

const TABS = [
  { key: 'terms', label: 'Terms of Use' },
  { key: 'privacy', label: 'Privacy Policy' },
  { key: 'disclaimer', label: 'Disclaimer' },
  { key: 'about', label: 'About' },
  { key: 'faq', label: 'FAQ' },
  { key: 'contact', label: 'Contact' },
];

function SectionTitle({ children }) {
  return <h3 style={{ fontFamily: orb, fontSize: 14, fontWeight: 700, letterSpacing: 2, color: '#00ff9f', margin: '32px 0 14px' }}>{children}</h3>;
}
function P({ children }) {
  return <p style={{ fontFamily: raj, fontSize: 15, color: '#8899bb', lineHeight: 1.7, margin: '0 0 14px' }}>{children}</p>;
}
function UL({ items }) {
  return <ul style={{ margin: '0 0 14px', paddingLeft: 20 }}>{items.map((t,i) => <li key={i} style={{ fontFamily: raj, fontSize: 14, color: '#8899bb', lineHeight: 1.7, marginBottom: 6 }}>{t}</li>)}</ul>;
}

function TermsContent() {
  return <>
    <P><em>Last updated: June 17, 2026</em></P>
    <P>These Terms govern your use of PandaEngine.app (the "Platform") and any services we provide. By using the Platform, registering an account, or purchasing a subscription, you agree to these Terms. If you do not agree, do not use the Platform.</P>

    <SectionTitle>1. Definitions</SectionTitle>
    <P><strong>Subscription Service / Data:</strong> Paid access to forex data processed and displayed by PandaEngine.app.</P>
    <P><strong>Subscriber:</strong> A registered user with an active paid subscription.</P>
    <P><strong>Content:</strong> Free data and editorial content published on the Platform.</P>
    <P><strong>Trial Period:</strong> Any free access period offered by us (currently 1 week for Starter tier).</P>

    <SectionTitle>2. Licence & Acceptable Use</SectionTitle>
    <P>You may view and use Platform material for your personal, non-commercial trading use only. You must not:</P>
    <UL items={[
      'Redistribute, sell, or commercially exploit Platform data, signals, or indicators;',
      'Use automated data scraping, bots, or crawlers against the Platform;',
      'Attempt to reverse-engineer, decompile, or extract the scoring algorithms;',
      'Attempt to impair or breach Platform security;',
      'Share your account credentials or allow multi-user access beyond your device limit;',
      'Use the Platform for any unlawful purpose.',
    ]} />
    <P>All intellectual property rights in the Platform, its data, MT4/MT5 indicators, and scoring models belong to PandaEngine.app.</P>

    <SectionTitle>3. Accounts</SectionTitle>
    <P>You must keep your login details confidential and are responsible for all activity under your account. We enforce device limits per tier. We may suspend or delete accounts that breach these Terms, engage in credential sharing, or where necessary for security or operational reasons.</P>

    <SectionTitle>4. Financial Disclaimer</SectionTitle>
    <P>PandaEngine.app is NOT a regulated financial adviser and does not provide investment advice. All data, signals, bias readings, and content are for information and education only and may contain errors. Investment values may rise or fall; you may lose money; past performance does not predict future results.</P>
    <P>You must conduct your own research and seek independent financial advice before acting on any information. We are not liable for losses arising from use of the Platform or Subscription Service.</P>

    <SectionTitle>5. Our Responsibilities</SectionTitle>
    <P>We use reasonable care in sourcing and processing data from reputable market feeds. We do not guarantee accuracy, completeness, uninterrupted availability, or fitness for any purpose.</P>
    <P>To the fullest extent permitted by law, we exclude liability for: loss of profit, business, goodwill, or data; indirect or consequential loss; events outside our reasonable control.</P>

    <SectionTitle>6. Trial Period</SectionTitle>
    <P>Only one Trial Period is permitted per user. We may cancel a trial if misuse or fraudulent activity is suspected. Trial features may be limited to the Starter tier.</P>

    <SectionTitle>7. Charges</SectionTitle>
    <P>Subscription fees are shown on the Pricing page and must be paid in advance. We offer monthly and lifetime payment options. If payment fails, we may suspend or terminate access.</P>

    <SectionTitle>8. Cancellation & Refunds</SectionTitle>
    <P><strong>Monthly Subscriptions:</strong> May be cancelled at any time. Access continues until the end of the current billing month. No refunds for unused periods.</P>
    <P><strong>Lifetime Subscriptions:</strong> Non-refundable after 7 days from purchase. Within 7 days, a full refund may be requested via support@pandaengine.app.</P>

    <SectionTitle>9. MT4/MT5 Indicators</SectionTitle>
    <P>Indicators are licensed per MT4/MT5 account ID. They will only function on approved accounts. Redistribution, decompilation, or sharing of indicator files (.ex4/.ex5) is strictly prohibited and will result in immediate account termination.</P>

    <SectionTitle>10. Termination</SectionTitle>
    <P>We may suspend or terminate access where Terms are breached, where unlawful activity is suspected, or where necessary for security or compliance. You must not attempt to bypass such measures.</P>

    <SectionTitle>11. Third-Party Links</SectionTitle>
    <P>The Platform may link to third-party sites. We do not endorse or control these and are not responsible for their content or your use of them.</P>

    <SectionTitle>12. General</SectionTitle>
    <P>If any part of these Terms is held invalid, the remainder continues in force. We may update these Terms by posting a revised version on the Platform. Continued use after changes constitutes acceptance.</P>

    <SectionTitle>13. Contact</SectionTitle>
    <P>Email: support@pandaengine.app</P>
  </>;
}

function PrivacyContent() {
  return <>
    <P><em>Last updated: June 17, 2026</em></P>
    <P>This Privacy Policy explains how PandaEngine.app ("we", "us") collects and uses your personal data.</P>

    <SectionTitle>1. Data We Collect</SectionTitle>
    <P><strong>Information you provide:</strong></P>
    <UL items={[
      'Account details (username, email, password)',
      'MT4/MT5 account IDs for indicator licensing',
      'Telegram username (optional, for signal delivery)',
      'Information submitted when contacting us',
    ]} />
    <P><strong>Information collected automatically:</strong></P>
    <UL items={[
      'IP address, device fingerprint, and browser type',
      'Pages viewed, session duration, navigation patterns',
      'Device count for concurrent login enforcement',
    ]} />
    <P><strong>Payment information:</strong> Handled securely by our payment provider — we do not store card details.</P>

    <SectionTitle>2. How We Use Your Data</SectionTitle>
    <P>We use your data to:</P>
    <UL items={[
      'Operate the Platform and your account;',
      'Provide and manage subscription services and indicator licensing;',
      'Enforce device limits and prevent credential sharing;',
      'Send essential service messages and signal alerts;',
      'Improve and personalise your experience;',
      'Ensure platform security and prevent fraud;',
      'Comply with legal obligations.',
    ]} />

    <SectionTitle>3. Cookies & Analytics</SectionTitle>
    <P>We use essential cookies to operate the Platform and remember your session. We may use analytics tools to understand usage patterns. You can control cookies through your browser settings.</P>

    <SectionTitle>4. Sharing Your Data</SectionTitle>
    <P>We may share data with: service providers (hosting, analytics, payment processors); regulators or law enforcement if legally required. We do NOT sell your personal data.</P>

    <SectionTitle>5. Data Security</SectionTitle>
    <P>We use technical and organisational measures to protect your data, including password hashing and session-based authentication. While we secure all information on our systems, internet transmission cannot be guaranteed as fully secure. Keep your login details confidential.</P>

    <SectionTitle>6. Data Retention</SectionTitle>
    <P>We retain personal data only as long as necessary to provide services, comply with legal requirements, resolve disputes, and maintain accurate records. Data is deleted or anonymised when no longer required.</P>

    <SectionTitle>7. Your Rights</SectionTitle>
    <P>You have the right to: access your data, correct inaccuracies, request deletion, restrict or object to processing, and request data portability. Contact support@pandaengine.app to exercise these rights. We respond within 30 days.</P>

    <SectionTitle>8. Changes to This Policy</SectionTitle>
    <P>We may update this Privacy Policy occasionally. The newest version will always appear on this page.</P>
  </>;
}

function DisclaimerContent() {
  return <>
    <P><strong>Please read before using PandaEngine.app</strong></P>

    <SectionTitle>1. Do Your Own Research</SectionTitle>
    <P>All content on PandaEngine.app — including gap scores, directional bias readings, momentum states, signal alerts, and indicator outputs — is for information and educational purposes only. You must conduct your own research and consider your personal financial circumstances before making any trading decision.</P>
    <P>You should seek independent financial advice and verify any information you intend to rely on. Nothing on this Platform replaces professional advice.</P>

    <SectionTitle>2. No Investment Advice</SectionTitle>
    <P>PandaEngine.app is a forex data intelligence platform. We are not a broker, investment adviser, or regulated entity, and we do not have access to non-public information.</P>
    <P>Nothing on this Platform constitutes:</P>
    <UL items={[
      'Investment advice;',
      'A recommendation to buy, sell, or hold any currency pair;',
      'Personalised financial, legal, tax, or investment guidance.',
    ]} />
    <P>All signals, scores, and bias readings are algorithmic outputs. They do not account for your personal risk tolerance, capital, experience, or objectives.</P>

    <SectionTitle>3. No Reliance & Limitation of Liability</SectionTitle>
    <P>You use all information on this Platform at your own risk. We are not responsible for any loss, damage, costs, or expenses arising from: reliance on Platform data or signals; trading decisions you make; any interactions or arrangements you enter into with third parties.</P>
    <P>Any decision to act on information from this Platform is solely your responsibility.</P>

    <SectionTitle>4. Investment Risk Warnings</SectionTitle>
    <P>Please note the following important risks:</P>
    <UL items={[
      'Forex trading involves substantial risk of loss and is not suitable for all investors.',
      'The value of positions may move against you rapidly.',
      'You may lose more than your initial investment when using leverage.',
      'Past performance of signals or bias readings is not a reliable indicator of future results.',
    ]} />
    <P>You should only trade with money that you can afford to lose and should consider seeking professional advice before making financial decisions.</P>

    <SectionTitle>5. MT4/MT5 Indicators</SectionTitle>
    <P>Custom indicators provided by PandaEngine.app are tools — not trading systems. They visualise data and algorithmic calculations. They do not execute trades and do not guarantee profitable outcomes. Use them as one input among many in your own trading process.</P>
  </>;
}

function AboutContent() {
  return <>
    <SectionTitle>About Panda Engine</SectionTitle>
    <P>Panda Engine is a forex intelligence platform built for traders who want clarity over noise. We scan 21 currency pairs every 5 minutes, computing directional bias through multi-timeframe strength analysis, momentum state classification, and trend detection.</P>
    <P>The platform was designed by a trader, for traders — with the goal of replacing hours of manual chart scanning with a single dashboard that shows you what's moving, which direction, and how strongly.</P>

    <SectionTitle>What We Do</SectionTitle>
    <P>Our engine processes live MT4/MT5 data across three timeframes (D1, H4, H1) to produce a directional bias score for each pair. This score feeds into momentum classification, signal detection, and confidence scoring — all delivered through a real-time dashboard, Telegram alerts, and custom MT4 indicators.</P>

    <SectionTitle>Our Philosophy</SectionTitle>
    <P>We believe the best trading decisions come from seeing the market clearly — not from predictions, tips, or signals you follow blindly. Panda Engine gives you the data to make your own informed decisions. Every feature is built around one principle: help you see what's actually happening in the market right now.</P>

    <SectionTitle>What We Are Not</SectionTitle>
    <P>We are not a broker, fund manager, or financial adviser. We do not execute trades on your behalf. We do not guarantee profits. We are a data intelligence tool — the trading decisions are always yours.</P>
  </>;
}

function FAQContent() {
  const faqs = [
    { q: 'What is Panda Engine?', a: 'Panda Engine is a forex intelligence platform that scans 21 currency pairs every 5 minutes, computing directional bias, momentum states, and signal strength across multiple timeframes. It helps traders identify which pairs are moving, in which direction, and how strongly.' },
    { q: 'Is this a trading signal service?', a: 'Not in the traditional sense. We provide data-driven bias readings and momentum analysis, not "buy now" or "sell now" instructions. The signals tab shows when our scoring model detects alignment across multiple factors — but every trading decision is yours to make.' },
    { q: 'What does the Starter tier include?', a: 'Starter is free for 1 week and includes the Live Signals tab and Position Calculator. It gives you a taste of the platform before committing.' },
    { q: 'What\'s the difference between Pro and Elite?', a: 'Pro ($99/mo or $3,499 lifetime) adds the Panel tab, full data table, valid setups, Panda AI assistant, and Research tab. Elite ($699/mo or $4,999 lifetime) unlocks everything — including the Overview, Signal Logs, Spike alerts, Trading Journal, Chart tab, and custom MT4/MT5 indicators.' },
    { q: 'How do the MT4/MT5 indicators work?', a: 'Our indicators are custom-coded .ex4/.ex5 files that run on your MetaTrader platform. They are licensed per account ID — once approved, you install the file and it connects to your specific account. They visualise our scoring and bias data directly on your charts.' },
    { q: 'Can I share my account with others?', a: 'No. Each account has a device limit enforced by the platform. Credential sharing is detected and will result in account suspension.' },
    { q: 'How is directional bias calculated?', a: 'The engine compares currency strength across D1, H4, and H1 timeframes. A higher gap between the base and quote currency indicates stronger directional conviction. The exact algorithm and thresholds are proprietary.' },
    { q: 'Do you offer refunds?', a: 'Monthly subscriptions: no refunds for unused periods, but you can cancel anytime. Lifetime purchases: refundable within 7 days of purchase by contacting support@pandaengine.app.' },
    { q: 'Is this financial advice?', a: 'No. PandaEngine.app provides data and analytical tools for educational and informational purposes only. We are not a regulated financial adviser. Always do your own research and consult a licensed professional before making trading decisions.' },
    { q: 'How do I contact support?', a: 'Email support@pandaengine.app. We typically respond within 24 hours.' },
  ];
  return <>
    <SectionTitle>Frequently Asked Questions</SectionTitle>
    {faqs.map((f, i) => (
      <div key={i} style={{ marginBottom: 24, padding: '20px 24px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 10 }}>
        <div style={{ fontFamily: orb, fontSize: 12, fontWeight: 700, color: '#e8f0ff', letterSpacing: 1, marginBottom: 10 }}>{f.q}</div>
        <P>{f.a}</P>
      </div>
    ))}
  </>;
}

function ContactContent() {
  return <>
    <SectionTitle>Get In Touch</SectionTitle>
    <P>Have a question about the platform, your subscription, or indicator licensing? We're here to help.</P>

    <div style={{ padding: '28px 24px', background: 'rgba(0,255,159,0.04)', border: '1px solid #00ff9f20', borderRadius: 12, marginBottom: 24 }}>
      <div style={{ fontFamily: orb, fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#00ff9f', marginBottom: 12 }}>EMAIL</div>
      <P>support@pandaengine.app</P>
      <P>We typically respond within 24 hours.</P>
    </div>

    <SectionTitle>Common Reasons to Contact Us</SectionTitle>
    <UL items={[
      'Subscription or billing questions',
      'MT4/MT5 indicator activation or account ID changes',
      'Technical issues with the dashboard',
      'Feature requests or feedback',
      'Refund requests (lifetime purchases within 7 days)',
      'Account deletion requests',
    ]} />

    <SectionTitle>Before Contacting Support</SectionTitle>
    <P>Check the FAQ section — your question may already be answered there. If you're having a technical issue, please include your username and a description of the problem.</P>
  </>;
}

const TAB_CONTENT = {
  terms: TermsContent,
  privacy: PrivacyContent,
  disclaimer: DisclaimerContent,
  about: AboutContent,
  faq: FAQContent,
  contact: ContactContent,
};

export default function LegalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('terms');

  useEffect(() => {
    if (router.query.tab && TAB_CONTENT[router.query.tab]) {
      setActiveTab(router.query.tab);
    }
  }, [router.query.tab]);

  const Content = TAB_CONTENT[activeTab];
  const tabMeta = TABS.find(t => t.key === activeTab);

  return (
    <>
      <Head>
        <title>Panda Engine — {tabMeta?.label || 'Legal'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{ background: '#050810', color: '#e8f0ff', minHeight: '100vh' }}>
        {/* NAV */}
        <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(5,8,16,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <span style={{ fontSize: 20 }}>🐼</span>
            <span style={{ fontFamily: orb, fontSize: 12, fontWeight: 700, letterSpacing: 3, color: '#00ff9f' }}>PANDA ENGINE</span>
          </a>
          <a href="/" style={{ fontFamily: mono, fontSize: 10, color: '#445566', textDecoration: 'none', letterSpacing: 2 }}>← BACK TO HOME</a>
        </nav>

        <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px' }}>
          {/* TAB BAR */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 40, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 16 }}>
            {TABS.map(t => (
              <a key={t.key} href={`/legal?tab=${t.key}`} onClick={(e) => { e.preventDefault(); setActiveTab(t.key); router.replace(`/legal?tab=${t.key}`, undefined, { shallow: true }); }} style={{
                background: activeTab === t.key ? 'rgba(0,255,159,0.1)' : 'transparent',
                border: `1px solid ${activeTab === t.key ? '#00ff9f44' : '#1a2540'}`,
                borderRadius: 6, padding: '8px 16px', cursor: 'pointer',
                fontFamily: mono, fontSize: 9, letterSpacing: 2,
                color: activeTab === t.key ? '#00ff9f' : '#445566',
                transition: 'all 0.2s', textDecoration: 'none', display: 'inline-block',
              }}>{t.label.toUpperCase()}</a>
            ))}
          </div>

          {/* TITLE */}
          <h1 style={{ fontFamily: orb, fontSize: 'clamp(20px,3vw,30px)', fontWeight: 900, letterSpacing: 3, marginBottom: 32, color: '#e8f0ff' }}>
            {tabMeta?.label}
          </h1>

          {/* CONTENT */}
          <Content />
        </div>

        {/* FOOTER */}
        <footer style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '24px', textAlign: 'center' }}>
          <p style={{ fontFamily: mono, fontSize: 8, color: '#1a2538', letterSpacing: 1 }}>© 2026 PandaEngine.app · All rights reserved</p>
        </footer>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        strong { color: #e8f0ff; }
        em { color: #6b7fa8; font-style: italic; }
        button:hover { opacity: 0.9; }
        a:hover { color: #00ff9f !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #050810; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </>
  );
}
