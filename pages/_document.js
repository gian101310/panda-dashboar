import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="theme-color" content="#050a14" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" href="/icons/panda-192.png" />
        <link rel="apple-touch-icon" href="/icons/panda-192.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
