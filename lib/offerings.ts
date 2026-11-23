/** The Spaces & Services menu and the page behind each item. Workspaces and
 * flexible access live under /spaces/[slug], business services under
 * /services/[slug]. Prices live only on /pricing. Anything sold online gets a
 * Book now button straight to its booking page; the rest ask people to get in
 * touch. */

export type OfferingGroup = "workspaces" | "flexible" | "services";

export type Offering = {
  slug: string;
  group: OfferingGroup;
  title: string;
  /** One line under the title in the nav menu. */
  blurb: string;
  /** SVG path data for the 24×24 line icon. */
  icon: string;
  kicker: string;
  headline: string;
  lead: string;
  photo?: { src: string; alt: string };
  highlights: { title: string; text: string }[];
  /** Where Book now goes, with this offering already selected. Without it the
   * page offers a call or an email instead. */
  book?: string;
};

export const offeringGroups: { id: OfferingGroup; label: string }[] = [
  { id: "workspaces", label: "Workspaces" },
  { id: "flexible", label: "Flexible access" },
  { id: "services", label: "Business services" },
];

export const offerings: Offering[] = [
  {
    slug: "hot-desk",
    group: "workspaces",
    title: "Hot Desk",
    blurb: "Any open desk on a flexible monthly plan",
    icon: "M3 10h18M5 10v9M19 10v9M8 6h8v4H8z",
    kicker: "Flexible",
    headline: "Sit anywhere. Start working.",
    lead: "A seat in the open lounge on a monthly plan. Take any desk that's free, plug in and go, with Wi-Fi, prints and the café included.",
    photo: { src: "/collabix/img/photos/openoffice.jpg", alt: "Open-plan hot desk area" },
    highlights: [
      { title: "Any free desk", text: "Choose from 28 shared desks on a calm, naturally lit floor." },
      { title: "1 Gbps Wi-Fi", text: "Enterprise fibre with wired backup, so calls don't drop." },
      { title: "10 pages of prints", text: "Printing included every month." },
      { title: "Café & pantry", text: "Barista coffee and a stocked pantry a few steps away." },
      { title: "Open 24/7", text: "Open around the clock, every day, so you can work whenever suits you." },
      { title: "Room to grow", text: "Move up to a dedicated desk or a cabin whenever you're ready." },
    ],
    book: "/book/passes?plan=hot-desk",
  },
  {
    slug: "dedicated-desk",
    group: "workspaces",
    title: "Dedicated Desk",
    blurb: "Your own fixed seat with a locker",
    icon: "M3 10h18M5 10v9M19 10v9M14 13h4v6h-4z",
    kicker: "Reserved",
    headline: "Same seat. Every day.",
    lead: "Your own fixed desk with a personal locker and meeting-room credits. Leave your things, come back tomorrow, pick up where you left off.",
    photo: { src: "/collabix/img/photos/desk.jpg", alt: "Dedicated desk with storage" },
    highlights: [
      { title: "A desk that's yours", text: "The same reserved seat every day, set up the way you like it." },
      { title: "Personal locker", text: "Lockable storage included with every dedicated plan." },
      { title: "Meeting-room credits", text: "2 credits a month, or 4 on Pro. 1 credit is 1 hour of room time." },
      { title: "20–30 pages of prints", text: "Printing included every month, depending on your plan." },
      { title: "Guest pass on Pro", text: "Bring a guest in on the Dedicated Desk Pro plan." },
      { title: "Ergonomic seating", text: "Task chairs specified for full working days." },
    ],
    book: "/book/passes?plan=dedicated-desk",
  },
  {
    slug: "private-cabin",
    group: "workspaces",
    title: "Private Cabin",
    blurb: "An enclosed cabin for a team of four",
    icon: "M4 21V4h16v17M4 21h16M14 12h.01",
    kicker: "Private · 4 people",
    headline: "A room for your team.",
    lead: "An enclosed cabin for a team of four with a standard fit-out, ready to move into. Your own door, with everything else at Collabix on hand.",
    photo: { src: "/collabix/img/photos/cabin.jpg", alt: "Private cabin for teams" },
    highlights: [
      { title: "Seats four", text: "One of four enclosed cabins, each fitted for a team of four." },
      { title: "Ready to move in", text: "Standard fit-out from day one. No setup, no wait." },
      { title: "Meeting-room credits", text: "2 credits on Pro and 4 on Enterprise for the 4-seater or the boardroom." },
      { title: "Guest passes", text: "2 guest passes a month on the Enterprise plan." },
      { title: "30 pages of prints", text: "Printing included on every cabin plan." },
      { title: "Front desk", text: "A staffed reception to greet your visitors and handle your mail." },
    ],
    book: "/book/passes?plan=cabin-base",
  },
  {
    slug: "monthly-annual-passes",
    group: "workspaces",
    title: "Monthly & Annual Passes",
    blurb: "A desk or a cabin for months or years",
    icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h3M8 17h6",
    kicker: "Monthly · Annual",
    headline: "Your desk or cabin, for months or years.",
    lead: "Pick a hot desk, your own fixed desk or a private cabin, choose how long and when to start, and pay online. Your space is held for the whole term.",
    photo: { src: "/collabix/img/photos/lounge.jpg", alt: "The Collabix work lounge" },
    highlights: [
      { title: "Six plans", text: "Hot Desk Flexi, Dedicated Desk and Dedicated Desk Pro, or a Base, Pro or Enterprise cabin for four." },
      { title: "Monthly or annual", text: "Book 1 to 11 months at the monthly rate, or 1 to 3 years at the annual rate." },
      { title: "Start when you like", text: "Pick any start date up to 90 days ahead; we show what's free for the whole term." },
      { title: "Pay online", text: "Pay securely by UPI, card or net banking and get your confirmation by email." },
      { title: "Everything included", text: "Wi-Fi, prints, the café and, on most plans, meeting-room credits and guest passes." },
      { title: "Agreement & deposit", text: "Once you've paid, our team sorts the agreement and the security deposit with you." },
    ],
    book: "/book/passes",
  },
  {
    slug: "day-pass",
    group: "flexible",
    title: "Day Pass",
    blurb: "A desk for a day or a half day",
    icon: "M4 5h16v14H4zM4 9h16M9 3v4M15 3v4",
    kicker: "Pay as you go",
    headline: "Drop in for the day.",
    lead: "No membership needed. Book a full day or a 4-hour block at a shared desk, or buy a bundle of passes for your team to use whenever.",
    photo: { src: "/collabix/img/photos/lounge.jpg", alt: "Breakout lounge" },
    highlights: [
      { title: "Full or half day", text: "A whole day, or a 4-hour block when that's all you need." },
      { title: "Weekly pass", text: "4 people for 6 consecutive days, for a team sprint or an offsite." },
      { title: "Corporate bundles", text: "Packs of 6, 8 or 10 accesses that anyone on your team can use, any time, with meeting credits." },
      { title: "Everything in the lounge", text: "Wi-Fi, the café and every shared desk." },
    ],
    book: "/book?product=day-full",
  },
  {
    slug: "meeting-rooms",
    group: "flexible",
    title: "Meeting Rooms",
    blurb: "4-seater and boardroom, by the hour",
    icon: "M3 4h18v12H3zM8 20h8M12 16v4",
    kicker: "4-seater & boardroom",
    headline: "Meet properly.",
    lead: "A compact 4-seat room with TV and whiteboard, and an 8-seat boardroom with integrated VC and an interactive panel. Book by the hour.",
    photo: { src: "/collabix/img/photos/meeting.jpg", alt: "Boardroom meeting room" },
    highlights: [
      { title: "Meeting room · 4 seats", text: "A TV and a whiteboard for reviews, interviews and client calls." },
      { title: "The Boardroom · 8 seats", text: "Integrated video conferencing and an interactive panel." },
      { title: "By the hour", text: "Book only the time you need, online in about a minute." },
      { title: "Use your credits", text: "Member plans include credits. 1 credit is 1 hour of room time." },
    ],
    book: "/book?product=meeting-4",
  },
  {
    slug: "virtual-office",
    group: "flexible",
    title: "Virtual Office",
    blurb: "Your business address for GST and registration",
    icon: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6",
    kicker: "Business address",
    headline: "A real address for your business.",
    lead: "Register your business at Collabix, Banaswadi. Use the address for GST and company registration, with your mail handled and your name on the board.",
    photo: { src: "/collabix/img/photos/hero.jpg", alt: "Collabix work lounge" },
    highlights: [
      { title: "Banaswadi address", text: "261, Ashwini Arcade, 100 Feet Road, HRBR Layout. Use it on your letterhead and website." },
      { title: "GST NOC", text: "A no-objection certificate so you can register for GST at this address." },
      { title: "Mail handling", text: "On Virtual Pro, we let you know when mail arrives and forward it by Bluedart pouch." },
      { title: "Name-board display", text: "Your business name on our board, included on Virtual Pro." },
      { title: "Meeting credits", text: "4 hours of meeting-room time a month on Virtual Pro, for when you need to meet in person." },
      { title: "GST and registration help", text: "Need the registration done too? Our service desk can handle it." },
    ],
  },
  {
    slug: "gst-accounting",
    group: "services",
    title: "GST & Accounting",
    blurb: "GST registration, monthly filing and CA support",
    icon: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
    kicker: "Happy to Help Service Desk",
    headline: "GST, accounts and CA support, handled.",
    lead: "Get registered for GST, keep your returns on time and have your books looked after, all from the desk downstairs. Members and non-members both welcome.",
    highlights: [
      { title: "GST registration", text: "We prepare and file your GST application and follow it through to your GSTIN." },
      { title: "Monthly GST returns", text: "Nil and non-nil filings done every month, on time." },
      { title: "Composition scheme", text: "Quarterly composition returns for small businesses on the scheme." },
      { title: "Accounting & bookkeeping", text: "Day-to-day books and statements kept in order." },
      { title: "CA support", text: "Help with income tax returns, compliance and notices from qualified CAs." },
      { title: "Pairs with Virtual Office", text: "No office yet? Use our Banaswadi address and GST NOC to register." },
    ],
  },
  {
    slug: "company-registration",
    group: "services",
    title: "Company Registration",
    blurb: "Company / LLP incorporation and Udyam",
    icon: "M4 21V7l8-4 8 4v14M4 21h16M9 10h6M9 14h6",
    kicker: "Happy to Help Service Desk",
    headline: "Start your company the right way.",
    lead: "Incorporate a private limited company or an LLP, register as an MSME under Udyam and get your registered office sorted, with one team handling the paperwork.",
    highlights: [
      { title: "Company / LLP incorporation", text: "Name approval, documents and filing for a private limited company or an LLP." },
      { title: "Udyam registration", text: "Register as an MSME and unlock the benefits that come with it." },
      { title: "Registered office", text: "Use the Collabix address as your registered office with a Virtual Office plan." },
      { title: "GST from day one", text: "Add GST registration and monthly filing alongside your incorporation." },
    ],
  },
  {
    slug: "websites-apps",
    group: "services",
    title: "Websites & Apps",
    blurb: "We design and build sites and apps for your business",
    icon: "M8 8l-5 4 5 4M16 8l5 4-5 4M14 4l-4 16",
    kicker: "Digital services",
    headline: "Your business, online.",
    lead: "From a simple website to a booking system or a mobile app, our team designs, builds and looks after it, so you can get on with running your business.",
    highlights: [
      { title: "Business websites", text: "Fast, mobile-friendly sites that look as good as your work." },
      { title: "Online booking & payments", text: "Let customers book and pay you online, like this site does." },
      { title: "Mobile apps", text: "Apps for Android and iOS, built around how your customers work." },
      { title: "Domain, hosting & email", text: "We set up your domain, hosting and business email." },
      { title: "Found on Google", text: "SEO basics and a Google Business listing so people can find you." },
      { title: "Care after launch", text: "Updates, fixes and changes once you're live." },
    ],
  },
];

export const offeringHref = (o: Offering) => `/${o.group === "services" ? "services" : "spaces"}/${o.slug}`;

export const findOffering = (base: "spaces" | "services", slug: string) =>
  offerings.find((o) => o.slug === slug && (base === "services") === (o.group === "services"));
