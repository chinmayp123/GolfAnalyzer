// Tiny markdown renderer for coaching reports — headings, bullets, bold.

function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="text-cream-50 font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    )
  );
}

export default function Markdown({ text }) {
  if (!text) return null;

  const blocks = [];
  let bullets = null;

  const flushBullets = () => {
    if (bullets) {
      blocks.push({ type: "ul", items: bullets });
      bullets = null;
    }
  };

  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (line.startsWith("- ")) {
      (bullets ||= []).push(line.slice(2));
      return;
    }
    flushBullets();
    if (!line) return;
    if (line.startsWith("## ")) blocks.push({ type: "h2", text: line.slice(3) });
    else if (line.startsWith("### ")) blocks.push({ type: "h3", text: line.slice(4) });
    else blocks.push({ type: "p", text: line });
  });
  flushBullets();

  return (
    <div>
      {blocks.map((block, i) => {
        if (block.type === "h2")
          return (
            <h2 key={i} className="font-display text-cream-50 text-lg mt-5 mb-2 first:mt-0">
              {renderInline(block.text)}
            </h2>
          );
        if (block.type === "h3")
          return (
            <h3 key={i} className="font-display text-cream-50 text-base mt-4 mb-1.5 first:mt-0">
              {renderInline(block.text)}
            </h3>
          );
        if (block.type === "ul")
          return (
            <ul key={i} className="my-2 space-y-1.5">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2.5 text-cream-300 leading-relaxed text-sm">
                  <span className="text-fairway-400 mt-px shrink-0">&bull;</span>
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="text-cream-300 leading-relaxed text-sm my-2">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
