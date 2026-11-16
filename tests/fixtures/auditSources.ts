export const safeSource = `
  export function DemoCard({ label }) {
    return <main aria-label="Synthetic demo">{label}</main>;
  }
`;

export const suspiciousSource = `
  import client from "remote-client";
  const result = fetch("/private");
  const response = window.fetch("/other");
  const code = eval("1 + 1");
  const generated = new Function("return 1");
  const settings = process.env;
  const frame = <iframe srcDoc="<script>alert(1)</script>" />;
  export { result, response, code, generated, settings, frame, client };
`;

export const malformedSource = "function Demo( { return <div>; }";
