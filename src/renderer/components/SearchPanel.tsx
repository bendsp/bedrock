import React, { useEffect, useState, useRef } from "react";
import { EditorView } from "@codemirror/view";
import {
  findNext,
  findPrevious,
  closeSearchPanel,
  setSearchQuery,
  SearchQuery,
  getSearchQuery,
} from "@codemirror/search";
import {
  ArrowDown,
  ArrowUp,
  X,
  CaseSensitive,
  Regex,
  Search,
} from "lucide-react";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "./ui/input-group";

export type SearchPanelProps = {
  view: EditorView;
};

export const SearchPanel: React.FC<SearchPanelProps> = ({ view }) => {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regexp, setRegexp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize from current selection or existing query
  useEffect(() => {
    const currentQuery = getSearchQuery(view.state);
    if (currentQuery.search) {
      setQuery(currentQuery.search);
      setCaseSensitive(currentQuery.caseSensitive);
      setRegexp(currentQuery.regexp);
    } else {
      const selection = view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to
      );
      if (selection && selection.length < 100 && !selection.includes("\n")) {
        setQuery(selection);
      }
    }
    // Focus input on mount
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Sync state to CodeMirror
  useEffect(() => {
    const searchQuery = new SearchQuery({
      search: query,
      caseSensitive,
      regexp,
    });
    view.dispatch({ effects: setSearchQuery.of(searchQuery) });
  }, [query, caseSensitive, regexp, view]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        findPrevious(view);
      } else {
        findNext(view);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearchPanel(view);
    }
  };

  return (
    <div className="flex items-center justify-center">
      <InputGroup className="w-[450px] bg-popover text-popover-foreground shadow-md border-border h-10 p-1 rounded-md overflow-hidden">
        <InputGroupAddon className="pl-2">
          <Search className="size-4 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find..."
          className="h-full"
        />
        <InputGroupAddon className="gap-0.5">
            <InputGroupButton
            onClick={() => setCaseSensitive(!caseSensitive)}
            variant={caseSensitive ? "secondary" : "ghost"}
            title="Match Case"
            className="h-8 w-8 rounded-sm px-0"
          >
            <CaseSensitive className="size-4" />
          </InputGroupButton>
          <InputGroupButton
            onClick={() => setRegexp(!regexp)}
            variant={regexp ? "secondary" : "ghost"}
            title="Regular Expression"
            className="h-8 w-8 rounded-sm px-0"
          >
            <Regex className="size-4" />
          </InputGroupButton>
        </InputGroupAddon>
        <InputGroupAddon className="border-l border-border ml-1 pl-1 gap-0.5">
          <InputGroupButton
            onClick={() => findPrevious(view)}
            title="Previous (Shift+Enter)"
            className="h-8 w-8 rounded-sm px-0"
          >
            <ArrowUp className="size-4" />
          </InputGroupButton>
          <InputGroupButton
            onClick={() => findNext(view)}
            title="Next (Enter)"
            className="h-8 w-8 rounded-sm px-0"
          >
            <ArrowDown className="size-4" />
          </InputGroupButton>
          <InputGroupButton
            onClick={() => closeSearchPanel(view)}
            title="Close (Esc)"
            className="h-8 w-8 rounded-sm px-0 hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-4" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
};

