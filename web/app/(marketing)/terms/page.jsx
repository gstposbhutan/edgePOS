import { COMPANY } from '@/lib/marketing/content'

export const metadata = {
  title: 'Terms of Service — Pelbu',
  description: 'The terms governing use of Pelbu, operated by Innovates Bhutan.',
}

const UPDATED = '7 July 2026'

const SECTIONS = [
  {
    h: '1. Agreement',
    p: [
      `These Terms of Service ("Terms") govern your access to and use of Pelbu — the point-of-sale, accounting and marketplace platform (the "Service") operated by ${COMPANY.name} ("we", "us"). By creating an account or using the Service, you agree to these Terms.`,
    ],
  },
  {
    h: '2. The Service',
    p: [
      'Pelbu provides an AI-assisted point of sale, GST accounting tools, and an online marketplace for businesses and their customers in Bhutan. Features may change, be added, or be withdrawn over time as the Service evolves.',
    ],
  },
  {
    h: '3. Accounts',
    p: [
      'You must provide accurate information when registering and keep your credentials secure. You are responsible for all activity under your account. Business owners are responsible for the team members they add and the permissions they grant.',
    ],
  },
  {
    h: '4. Merchant responsibilities',
    p: [
      'If you sell through Pelbu, you are responsible for your product listings, pricing, stock accuracy, fulfilment (pickup or delivery), and for honouring orders placed by customers. You are responsible for the lawfulness of the goods you sell.',
    ],
  },
  {
    h: '5. Tax & GST compliance',
    p: [
      'Pelbu calculates GST and generates records to help you meet Bhutan GST 2026 obligations. These tools are provided to assist you; you remain responsible for the accuracy of your filings and for meeting your tax obligations with the relevant authorities.',
    ],
  },
  {
    h: '6. Orders & payments',
    p: [
      'Marketplace orders are a contract between the buyer and the selling merchant. Prices are shown in Bhutanese Ngultrum (Nu.). Merchants may cancel or partially cancel orders where stock is unavailable, returning affected items to stock.',
    ],
  },
  {
    h: '7. Your content & data',
    p: [
      'You retain ownership of the content and data you upload. You grant us the licence needed to host and display it in order to operate the Service. We handle personal data as described in our Privacy Policy.',
    ],
  },
  {
    h: '8. Acceptable use',
    p: [
      'You agree not to misuse the Service — including attempting to disrupt it, access it without authorisation, upload unlawful content, or use it to defraud customers or evade tax.',
    ],
  },
  {
    h: '9. Availability',
    p: [
      'The Pelbu terminal is designed to keep working offline, but the online Service is provided on an "as available" basis. We aim for high availability but do not guarantee uninterrupted access.',
    ],
  },
  {
    h: '10. Liability',
    p: [
      'To the extent permitted by law, the Service is provided "as is" and we are not liable for indirect or consequential losses. Nothing in these Terms limits liability that cannot be limited under applicable law.',
    ],
  },
  {
    h: '11. Termination',
    p: [
      'You may stop using the Service at any time. We may suspend or terminate access for breach of these Terms or where required by law.',
    ],
  },
  {
    h: '12. Governing law',
    p: [
      'These Terms are governed by the laws of the Kingdom of Bhutan.',
    ],
  },
  {
    h: '13. Changes',
    p: [
      'We may update these Terms from time to time. Material changes will be reflected by updating the date below, and continued use of the Service constitutes acceptance of the revised Terms.',
    ],
  },
  {
    h: '14. Contact',
    p: [
      `Questions about these Terms? Contact ${COMPANY.name} at ${COMPANY.email} or ${COMPANY.phone}, ${COMPANY.address}.`,
    ],
  },
]

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <span className="text-xs font-semibold uppercase tracking-wide text-primary">Legal</span>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated {UPDATED} · Operated by {COMPANY.name}</p>

      <div className="mt-10 space-y-8">
        {SECTIONS.map(s => (
          <div key={s.h}>
            <h2 className="text-lg font-semibold">{s.h}</h2>
            {s.p.map((para, i) => (
              <p key={i} className="mt-2 text-sm leading-relaxed text-muted-foreground">{para}</p>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
