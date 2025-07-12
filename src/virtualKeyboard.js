import React, { useEffect, useRef, useState, useCallback } from "react";
import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote} from "@blocknote/react";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";
import "@blocknote/react/style.css";
import {filterSuggestionItems} from "@blocknote/core";

export default function VirtualKeyboardWithEditor() {
  const editor = useCreateBlockNote();
  const blocknoteWrapperRef = useRef(null);
  const keyboardRef = useRef(null);
  const [layoutName, setLayoutName] = useState("default");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const blurTimeoutRef = useRef(null);
  const typingTimerRef = useRef(null);
  const focusRetryRef = useRef(null);
  const isTypingRef = useRef(false);
  const lastTypingTimeRef = useRef(0);

  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const startTyping = () => {
    isTypingRef.current = true;
    lastTypingTimeRef.current = Date.now();
    clearTimeout(typingTimerRef.current);
  };

  const stopTyping = () => {
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      const elapsed = Date.now() - lastTypingTimeRef.current;
      if (elapsed > 300) {
        isTypingRef.current = false;
      }
    }, 300);
  };

  const forceEditorFocus = useCallback(
    debounce(() => {
      const view = editor?._tiptapEditor?.view;
      if (!view) return;

      view.focus();

      const { state } = view;
      const tr = state.tr.setSelection(
        state.selection.constructor.near(state.selection.$to)
      );
      view.dispatch(tr.scrollIntoView());

      focusRetryRef.current = setTimeout(() => {
        if (document.activeElement !== view.dom) {
          view.focus();
        }
      }, 50);
    }, 100),
    [editor]
  );

  const handleKeyboardInput = async (key) => {
    startTyping();

    const tiptapEditor = editor?._tiptapEditor;
    const view = tiptapEditor?.view;
    const state = tiptapEditor?.state;

    if (!view || !state) return;

    const { schema, selection } = state;
    const { from, to, empty } = selection;
    const tr = state.tr;

    switch (key) {
      case "{shift}":
        setLayoutName((prev) => (prev === "default" ? "shift" : "default"));
        stopTyping();
        return;
      case "{numbers}":
        setLayoutName("numbers");
        return;
      case "{default}":
        setLayoutName("default");
        return;
      case "{space}": {
        const spaceNode = schema.text(" ");
        if (!spaceNode) return;
        const trSpace = tr.replaceRangeWith(from, to, spaceNode);
        const resolved = trSpace.doc.resolve(from + 1);
        const selection = state.selection.constructor.near(resolved);
        view.dispatch(trSpace.setSelection(selection).scrollIntoView());
        forceEditorFocus();
        return;
      }

      case "{enter}": {
        const paragraph = schema.nodes.paragraph.createAndFill();
        if (!paragraph) return;

        const { $from } = selection;
        let depth = $from.depth;
        while (
          depth > 0 &&
          !$from.node(depth).type.contentMatch.defaultType?.name.includes("paragraph")
          ) {
          depth--;
        }

        const insertPos = $from.after(depth);
        const trEnter = tr.insert(insertPos, paragraph);
        const resolved = trEnter.doc.resolve(insertPos + 1);
        const sel = state.selection.constructor.near(resolved, 1);
        view.dispatch(trEnter.setSelection(sel).scrollIntoView());
        forceEditorFocus();
        return;
      }
      case "{backspace}": {
        const $from = selection.$from;

        let targetDepth = $from.depth;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === "paragraph") {
            targetDepth = d;
            break;
          }
        }

        const isAtStartOfBlock = from === $from.start(targetDepth);
        const isEmptyBlock = $from.node(targetDepth).content.size === 0;

        if (isAtStartOfBlock && isEmptyBlock) {
          const blockStart = $from.before(targetDepth);
          const blockNode = state.doc.nodeAt(blockStart);
          const parentDepth = targetDepth - 1;
          const parentStart = $from.before(parentDepth);
          const parentNode = state.doc.nodeAt(parentStart);
          const isOnlyChild = parentNode?.childCount === 1;

          if (isOnlyChild && parentNode) {
            tr.delete(parentStart, parentStart + parentNode.nodeSize);
          } else if (blockNode) {
            tr.delete(blockStart, blockStart + blockNode.nodeSize);
          }

          const resolvedPos = tr.doc.resolve(Math.max(0, blockStart - 1));
          const sel = state.selection.constructor.near(resolvedPos, -1);
          view.dispatch(tr.setSelection(sel).scrollIntoView());
          forceEditorFocus();
          return;
        }

        if (!empty) {
          const trDel = tr.deleteSelection();
          view.dispatch(trDel.scrollIntoView());
          forceEditorFocus();
          return;
        }

        const trBack = tr.delete(from - 1, from);
        view.dispatch(trBack.scrollIntoView());
        forceEditorFocus();
        return;
      }
      // case "/": {
      //   try {
      //     const tiptap = editor._tiptapEditor;
      //
      //     // Chèn ký tự "/"
      //     tiptap.commands.insertContent("/");
      //
      //     // Gọi suggestion menu thủ công
      //     const suggestionStorage = tiptap.extensionStorage?.suggestion;
      //     if (suggestionStorage?.triggerCharacterMenu) {
      //       const from = tiptap.state.selection.from;
      //       suggestionStorage.triggerCharacterMenu({
      //         char: "/",
      //         query: "",
      //         range: { from, to: from },
      //       });
      //     }
      //
      //     tiptap.commands.focus();
      //   } catch (error) {
      //     console.log(error, "âââ");
      //   }
      //
      //   forceEditorFocus();
      //   return;
      // }



      default:
        if (key.length === 1) {
          const textNode = schema.text(key);
          if (!textNode) return;

          const trText = tr.replaceRangeWith(from, to, textNode);
          const resolved = trText.doc.resolve(from + 1);
          const sel = state.selection.constructor.near(resolved);
          view.dispatch(trText.setSelection(sel).scrollIntoView());
        }
        break;
    }

    forceEditorFocus();
    stopTyping();
  };

  const isMobile = () => {
    return (
      typeof window !== "undefined" &&
      (window.innerWidth <= 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        ))
    );
  };

  useEffect(() => {
    if (!isMobile()) {
      setIsKeyboardVisible(true);
      return;
    }

    const editableEl = document.querySelector('[contenteditable="true"]');
    if (editableEl) {
      editableEl.setAttribute("inputmode", "none");
      editableEl.setAttribute("autocomplete", "off");
      editableEl.setAttribute("autocorrect", "off");
      editableEl.setAttribute("autocapitalize", "off");
      editableEl.style.caretColor = "auto";
      editableEl.style.userSelect = "text";
      editableEl.style.webkitUserSelect = "text";
    }

    const handleFocus = () => {
      clearTimeout(blurTimeoutRef.current);
      setIsKeyboardVisible(true);
      forceEditorFocus();
    };

    const handleBlur = () => {
      blurTimeoutRef.current = setTimeout(() => {
        const activeElement = document.activeElement;
        const isFocusInKeyboard = keyboardRef.current?.contains(activeElement);
        const isFocusInEditor = editor?._tiptapEditor?.view.dom.contains(activeElement);
        const recentTyping = Date.now() - lastTypingTimeRef.current < 500;

        if (!isFocusInKeyboard && !isFocusInEditor && !isTypingRef.current && !recentTyping) {
          setIsKeyboardVisible(false);
        }
      }, 300);
    };

    const editorElement = editor?._tiptapEditor?.view.dom;
    if (editorElement) {
      editorElement.addEventListener("focus", handleFocus, true);
      editorElement.addEventListener("blur", handleBlur, true);
    }

    return () => {
      if (editorElement) {
        editorElement.removeEventListener("focus", handleFocus, true);
        editorElement.removeEventListener("blur", handleBlur, true);
      }
      clearTimeout(blurTimeoutRef.current);
      clearTimeout(typingTimerRef.current);
      clearTimeout(focusRetryRef.current);
    };
  }, [editor]);

  const lastClickTimeRef = useRef(0);

  const handleEditorClick = () => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;

    if (timeSinceLastClick < 400) return;

    lastClickTimeRef.current = now;

    if (isMobile()) {
      forceEditorFocus();
      setIsKeyboardVisible(true);
    }
  };


  return (
    <div
      style={{
        padding: 16,
        paddingBottom: isMobile() && isKeyboardVisible ? "300px" : "16px",
        position: "relative",
        minHeight: "100vh",
      }}
    >
      <div
        ref={blocknoteWrapperRef}
        onTouchStart={(e) => {
          if (isMobile()) {
            if (e.touches.length === 1) {
              const touch = e.touches[0];
              if (touch.target?.closest('[contenteditable="true"]')) {
                return;
              }
            }
            e.preventDefault();
            handleEditorClick();
          }
        }}

        onClick={handleEditorClick}
        style={{ minHeight: "200px" }}
      >
        <BlockNoteView editor={editor} slashMenu={true}>
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) => {
              console.log("👉 Triggered with query:", query);
              return filterSuggestionItems(getDefaultReactSlashMenuItems(editor), query);
            }}

            minQueryLength={0}
          />

        </BlockNoteView>

      </div>

      {(!isMobile() || isKeyboardVisible) && (
        <div
          ref={keyboardRef}
          style={{
            position: isMobile() ? "fixed" : "relative",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: "#fff",
            boxShadow: "0 -2px 10px rgba(0,0,0,0.1)",
            marginTop: isMobile() ? 0 : 16,
          }}
          // onTouchStart={isMobile() ? handleKeyboardTouch : undefined}
        >
          <Keyboard
            onKeyPress={handleKeyboardInput}
            layoutName={layoutName}
            layout={{
              default: [
                "1 2 3 4 5 6 7 8 9 0",
                "q w e r t y u i o p",
                "a s d f g h j k l",
                "{shift} z x c v b n m {backspace}",
                "{numbers} / {space} {enter}",
              ],
              shift: [
                "! @ # $ % ^ & * ( )",
                "Q W E R T Y U I O P",
                "A S D F G H J K L",
                "{shift} Z X C V B N M {backspace}",
                "{numbers} / {space} {enter}",
              ],
              numbers: [
                "` ~ - _ = + [ ] { } \\ |",
                "; : ' \" , . / ?",
                "! @ # $ % ^ & * ( )",
                "{default} {space} {backspace} {enter}",
              ],
            }}
            display={{
              "{backspace}": "⌫",
              "{enter}": "⏎",
              "{shift}": "⇧",
              "{space}": "␣",
              "{numbers}": "123",
              "{default}": "ABC",
            }}
            theme="hg-theme-default"
            preventMouseDownDefault={true}
          />
        </div>
      )}
    </div>
  );
}