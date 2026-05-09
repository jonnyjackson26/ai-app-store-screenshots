"use client";

import Link from "next/link";
import { useRef } from "react";
import { CiFileOn } from "react-icons/ci";
import { FaGithub } from "react-icons/fa";
import { useFilePicker } from "use-file-picker";
import {
  ChevronDown,
  Download,
  FilePlus,
  Hand,
  MousePointerClick,
  Redo2,
  Undo2
} from "lucide-react";

import { ActiveTool, Editor } from "@/features/editor/types";
import { Logo } from "@/features/editor/components/logo";

import { cn } from "@/lib/utils";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useConfirm } from "@/hooks/use-confirm";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavbarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
};

export const Navbar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: NavbarProps) => {
  const [NewConfirmDialog, confirmNew] = useConfirm(
    "Start a new design?",
    "Any unsaved work on the current canvas will be lost. Export it first if you want to keep it."
  );
  const [OpenConfirmDialog, confirmOpen] = useConfirm(
    "Are you sure?",
    "You are about to replace the current project with the file you open."
  );

  const { openFilePicker } = useFilePicker({
    accept: ".json",
    onFilesSuccessfullySelected: ({ plainFiles }: any) => {
      if (plainFiles && plainFiles.length > 0) {
        const file = plainFiles[0];
        const reader = new FileReader();
        reader.readAsText(file, "UTF-8");
        reader.onload = () => {
          editor?.loadJson(reader.result as string);
        };
      }
    },
  });

  const onNew = async () => {
    const ok = await confirmNew();
    if (ok) {
      window.location.reload();
    }
  };

  const onOpen = async () => {
    const ok = await confirmOpen();
    if (ok) {
      openFilePicker();
    }
  };

  const hasFocusedTitle = useRef(false);

  return (
    <nav className="w-full flex items-center p-4 h-[68px] gap-x-3 border-b lg:pl-[34px]">
      <NewConfirmDialog />
      <OpenConfirmDialog />
      <Logo />
      <Separator orientation="vertical" className="h-6" />
      <div className="w-full flex items-center gap-x-1 h-full">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              File
              <ChevronDown className="size-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-60">
            <DropdownMenuItem
              onClick={onNew}
              className="flex items-center gap-x-2"
            >
              <FilePlus className="size-8" />
              <div>
                <p>New</p>
                <p className="text-xs text-muted-foreground">
                  Start a blank canvas
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onOpen}
              className="flex items-center gap-x-2"
            >
              <CiFileOn className="size-8" />
              <div>
                <p>Open</p>
                <p className="text-xs text-muted-foreground">
                  Open a JSON file
                </p>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Separator orientation="vertical" className="mx-2" />
        <input
          value={editor?.projectTitle ?? ""}
          onChange={(e) => editor?.setProjectTitle(e.target.value)}
          onFocus={(e) => {
            if (!hasFocusedTitle.current) {
              hasFocusedTitle.current = true;
              e.target.select();
            }
          }}
          placeholder="Untitled design"
          className="h-9 px-3 text-sm bg-transparent rounded-md border border-transparent hover:border-input focus:border-input focus:bg-background outline-none transition-colors max-w-[240px] [field-sizing:content]"
        />
        <Separator orientation="vertical" className="mx-2" />
        <Hint label="Select" side="bottom" sideOffset={10}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChangeActiveTool("select")}
            className={cn(activeTool === "select" && "bg-gray-100")}
          >
            <MousePointerClick className="size-4" />
          </Button>
        </Hint>
        <Hint label="Pan (hold Space)" side="bottom" sideOffset={10}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChangeActiveTool("pan")}
            className={cn(activeTool === "pan" && "bg-gray-100")}
          >
            <Hand className="size-4" />
          </Button>
        </Hint>
        <Hint label="Undo" side="bottom" sideOffset={10}>
          <Button
            disabled={!editor?.canUndo()}
            variant="ghost"
            size="icon"
            onClick={() => editor?.onUndo()}
          >
            <Undo2 className="size-4" />
          </Button>
        </Hint>
        <Hint label="Redo" side="bottom" sideOffset={10}>
          <Button
            disabled={!editor?.canRedo()}
            variant="ghost"
            size="icon"
            onClick={() => editor?.onRedo()}
          >
            <Redo2 className="size-4" />
          </Button>
        </Hint>
        <div className="ml-auto flex items-center gap-x-4">
          <Button size="sm" variant="ghost" asChild>
            <Link
              href="https://github.com/jonnyjackson26/ai-app-store-screenshots"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
            >
              <FaGithub className="size-4 mr-2" />
              Open Source
            </Link>
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                Export
                <Download className="size-4 ml-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-60">
              <DropdownMenuItem
                className="flex items-center gap-x-2"
                onClick={() => editor?.saveJson()}
              >
                <CiFileOn className="size-8" />
                <div>
                  <p>JSON</p>
                  <p className="text-xs text-muted-foreground">
                    Save for later editing
                  </p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-x-2"
                onClick={() => editor?.savePng()}
              >
                <CiFileOn className="size-8" />
                <div>
                  <p>PNG</p>
                  <p className="text-xs text-muted-foreground">
                    Best for sharing on the web
                  </p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-x-2"
                onClick={() => editor?.saveJpg()}
              >
                <CiFileOn className="size-8" />
                <div>
                  <p>JPG</p>
                  <p className="text-xs text-muted-foreground">
                    Best for printing
                  </p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-x-2"
                onClick={() => editor?.saveSvg()}
              >
                <CiFileOn className="size-8" />
                <div>
                  <p>SVG</p>
                  <p className="text-xs text-muted-foreground">
                    Best for editing in vector software
                  </p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
};
