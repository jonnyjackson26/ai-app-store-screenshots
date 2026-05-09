import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { IoTriangle } from "react-icons/io5";
import { FaDiamond } from "react-icons/fa6";
import { FaCircle, FaSquare, FaSquareFull } from "react-icons/fa";

import {
  ActiveTool,
  type ColorValue,
  Editor,
  STROKE_COLOR,
  STROKE_WIDTH,
} from "@/features/editor/types";
import { firstStopColor } from "@/features/editor/color-utils";
import { ShapeTool } from "@/features/editor/components/shape-tool";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";
import { ColorPicker } from "@/features/editor/components/color-picker";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ElementsSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
}

type SectionId = "shapes" | "draw";

interface AccordionSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const AccordionSection = ({ title, isOpen, onToggle, children }: AccordionSectionProps) => (
  <div className="border-b last:border-b-0">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      <ChevronDown
        className={cn(
          "h-4 w-4 text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-180",
        )}
      />
    </button>
    {isOpen && <div className="px-4 pb-4">{children}</div>}
  </div>
);

export const ElementsSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: ElementsSidebarProps) => {
  const [openSection, setOpenSection] = useState<SectionId | null>("shapes");

  const isVisible = activeTool === "elements";

  // Drawing mode follows the Draw accordion: enabled iff Elements panel is open
  // and Draw section is expanded.
  useEffect(() => {
    if (isVisible && openSection === "draw") {
      editor?.enableDrawingMode();
    } else {
      editor?.disableDrawingMode();
    }
  }, [isVisible, openSection, editor]);

  const onClose = () => {
    onChangeActiveTool("select");
  };

  const toggleSection = (id: SectionId) =>
    setOpenSection((current) => (current === id ? null : id));

  const strokeColorValue: string = firstStopColor(
    editor?.getActiveStrokeColor() ?? STROKE_COLOR,
  );
  const strokeWidthValue = editor?.getActiveStrokeWidth() || STROKE_WIDTH;

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        isVisible ? "visible" : "hidden",
      )}
    >
      <ToolSidebarHeader title="Elements" description="Add elements to your canvas" />
      <ScrollArea>
        <div>
          <AccordionSection
            title="Shapes"
            isOpen={openSection === "shapes"}
            onToggle={() => toggleSection("shapes")}
          >
            <div className="grid grid-cols-3 gap-4">
              <ShapeTool onClick={() => editor?.addCircle()} icon={FaCircle} />
              <ShapeTool onClick={() => editor?.addSoftRectangle()} icon={FaSquare} />
              <ShapeTool onClick={() => editor?.addRectangle()} icon={FaSquareFull} />
              <ShapeTool onClick={() => editor?.addTriangle()} icon={IoTriangle} />
              <ShapeTool
                onClick={() => editor?.addInverseTriangle()}
                icon={IoTriangle}
                iconClassName="rotate-180"
              />
              <ShapeTool onClick={() => editor?.addDiamond()} icon={FaDiamond} />
            </div>
          </AccordionSection>

          <AccordionSection
            title="Draw"
            isOpen={openSection === "draw"}
            onToggle={() => toggleSection("draw")}
          >
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm">Brush width</Label>
                <Slider
                  value={[strokeWidthValue]}
                  onValueChange={(values) => editor?.changeStrokeWidth(values[0])}
                />
              </div>
              <ColorPicker
                value={strokeColorValue}
                onChange={(value: ColorValue) => editor?.changeStrokeColor(value)}
                allowGradient={false}
              />
            </div>
          </AccordionSection>
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};
