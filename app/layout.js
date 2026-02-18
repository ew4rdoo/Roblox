import "./globals.css";

export const metadata = {
  title: "Roblox Growth Scout — Game Discovery Engine",
  description:
    "Find undermarketed Roblox games with high growth potential. Score games on engagement, ratings, update frequency, and growth headroom.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
