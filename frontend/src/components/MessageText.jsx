import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import Icon from "./Icon.jsx";

function splitMessage(text) {
  const parts = [];
  const linkPattern = /https?:\/\/[^\s<>"']+/gi;
  let lastIndex = 0;
  let match;

  while ((match = linkPattern.exec(text)) !== null) {
    let link = match[0];

    // Keep common sentence punctuation outside the clickable link.
    while (/[.,!?;:]$/.test(link)) {
      link = link.slice(0, -1);
    }

    if (!link) {
      continue;
    }

    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        value: text.slice(lastIndex, match.index),
      });
    }

    parts.push({
      type: "link",
      value: link,
    });

    lastIndex = match.index + link.length;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  return parts;
}

export default function MessageText({ text }) {
  const [selectedLink, setSelectedLink] = useState(null);
  const parts = splitMessage(text);

  return (
    <>
      <span className="message-text">
        {parts.map((part, index) =>
          part.type === "link" ? (
            <button
              key={index}
              type="button"
              className="message-link"
              onClick={() => setSelectedLink(part.value)}
            >
              {part.value}
            </button>
          ) : (
            <span key={index}>{part.value}</span>
          )
        )}
      </span>

      {selectedLink && (
        <div className="link-warning-backdrop">
          <div
            className="link-warning-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="link-warning-title"
          >
            <h3 id="link-warning-title">Open external link?</h3>

            <p>
              Check the full destination before opening it. LockTalk cannot
              verify that this link is safe.
            </p>

            <p className="link-warning-destination">{selectedLink}</p>

            <div className="link-warning-actions">
              <button type="button" onClick={() => setSelectedLink(null)}>
                <Icon icon={X} size={15} /> Cancel
              </button>

              <a
                href={selectedLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setSelectedLink(null)}
              >
                <Icon icon={ExternalLink} size={15} /> Open link
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}