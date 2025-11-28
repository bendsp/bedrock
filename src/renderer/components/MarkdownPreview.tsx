import React, { useEffect, useState } from "react";
import { ITextModel, ModelEventType } from "../../shared/types";
import { renderMarkdown } from "../services/markdownRenderer";

interface MarkdownPreviewProps {
    model: ITextModel;
    throttleMs?: number;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
    model,
    throttleMs = 250,
}) => {
    const [html, setHtml] = useState<string>(() =>
        renderMarkdown(model.getAll())
    );

    useEffect(() => {
        let timeoutRef: ReturnType<typeof setTimeout> | null = null;

        const flush = () => {
            const rendered = renderMarkdown(model.getAll());
            setHtml(rendered);
            timeoutRef = null;
        };

        const schedule = () => {
            if (timeoutRef) {
                clearTimeout(timeoutRef);
            }
            timeoutRef = setTimeout(flush, throttleMs);
        };

        flush();

        model.on(ModelEventType.CONTENT_CHANGED, schedule);

        return () => {
            if (timeoutRef) {
                clearTimeout(timeoutRef);
            }
            model.off(ModelEventType.CONTENT_CHANGED, schedule);
        };
    }, [model, throttleMs]);

    return (
        <div
            className='markdown-preview'
            aria-label='Markdown preview'
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};

export default MarkdownPreview;
