#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from 'fs';
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { z } from "zod";
// Create server instance
const server = new McpServer({
    name: "pdf-server",
    version: "0.0.1",
});
// Register PDF tools
server.tool("remove-pdf-pages", "Remove pages from a PDF", {
    pdfPath: z.string().describe("The path to the PDF file"),
    pageNumbers: z.array(z.number()).describe("The page numbers to remove from the PDF (1-indexed)"),
}, async ({ pdfPath, pageNumbers }) => {
    try {
        // Decode base64 PDF
        const pdfData = fs.readFileSync(pdfPath, { encoding: 'base64' });
        // Load the PDF document
        const pdfDoc = await PDFDocument.load(pdfData);
        // Get total number of pages
        const totalPages = pdfDoc.getPageCount();
        // Validate page numbers
        const invalidPages = pageNumbers.filter(num => num < 1 || num > totalPages);
        if (invalidPages.length > 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: Invalid page numbers: ${invalidPages.join(', ')}. The document has ${totalPages} pages.`,
                    },
                ],
            };
        }
        // Sort page numbers in descending order to avoid index shifting when removing pages
        const sortedPageNumbers = [...pageNumbers].sort((a, b) => b - a);
        // Remove pages
        for (const pageNum of sortedPageNumbers) {
            // PDF.js uses 0-based indexing, but our API uses 1-based indexing
            pdfDoc.removePage(pageNum - 1);
        }
        // Serialize the modified PDF to base64
        const modifiedPdfBytes = await pdfDoc.save();
        const modifiedPdfBase64 = Buffer.from(modifiedPdfBytes).toString('base64');
        fs.writeFileSync(pdfPath, modifiedPdfBase64, { encoding: 'base64' });
        return {
            content: [
                {
                    type: "text",
                    text: `Successfully removed ${pageNumbers.length} pages from the PDF.`,
                },
            ],
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error processing PDF: ${errorMessage}`,
                },
            ],
        };
    }
});
server.tool("add-text-watermark", "Add a text watermark to a PDF", {
    watermarkText: z.string().describe("The text to add as a watermark"),
    pdfPath: z.string().describe("The path to the PDF file"),
    position: z.enum(["center", "top", "bottom", "topLeft", "topRight", "bottomLeft", "bottomRight"])
        .default("center")
        .describe("The position of the watermark on the page"),
}, async ({ watermarkText, pdfPath, position }) => {
    try {
        // Decode base64 PDF
        const pdfData = fs.readFileSync(pdfPath, { encoding: 'base64' });
        // Load the PDF document
        const pdfDoc = await PDFDocument.load(pdfData);
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        // 遍历所有页面添加水印
        const pages = pdfDoc.getPages();
        for (const page of pages) {
            const { width, height } = page.getSize();
            // 计算水印位置
            const textSize = 50; // 字体大小
            const padding = 50; // 额外边距
            let x = 0;
            let y = 0;
            // 根据position参数设置水印位置
            switch (position) {
                case "center":
                    x = width / 2 - 150;
                    y = height / 2;
                    break;
                case "top":
                    x = width / 2 - 150;
                    y = height - padding;
                    break;
                case "bottom":
                    x = width / 2 - 150;
                    y = padding + textSize;
                    break;
                case "topLeft":
                    x = padding;
                    y = height - padding;
                    break;
                case "topRight":
                    x = width - 300;
                    y = height - padding;
                    break;
                case "bottomLeft":
                    x = padding;
                    y = padding + textSize;
                    break;
                case "bottomRight":
                    x = width - 300;
                    y = padding + textSize;
                    break;
            }
            // 设置水印文本
            page.drawText(watermarkText, {
                x: x,
                y: y,
                size: textSize, // 字体大小
                font: helveticaFont,
                color: rgb(1, 0, 0), // 红色，更明显
                opacity: 0.8, // 增加不透明度
                rotate: degrees(45) // 旋转45度
            });
        }
        // 保存修改后的PDF
        const modifiedPdfBytes = await pdfDoc.save();
        const modifiedPdfBase64 = Buffer.from(modifiedPdfBytes).toString('base64');
        fs.writeFileSync(pdfPath, modifiedPdfBase64, { encoding: 'base64' });
        return {
            content: [
                {
                    type: "text",
                    text: `Successfully added text watermark to the PDF.`,
                },
            ],
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error processing PDF: ${errorMessage}`,
                },
            ],
        };
    }
});
server.tool("merge-pdfs", "Merge multiple PDF files into one", {
    pdfPaths: z.array(z.string()).describe("Array of PDF file paths to merge"),
    outputPath: z.string().describe("Output path for the merged PDF"),
}, async ({ pdfPaths, outputPath }) => {
    try {
        // Create a new PDF document
        const mergedPdf = await PDFDocument.create();
        // Process each PDF file
        for (const pdfPath of pdfPaths) {
            // Read and decode the PDF
            const pdfData = fs.readFileSync(pdfPath, { encoding: 'base64' });
            const pdf = await PDFDocument.load(pdfData);
            // Copy all pages
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
        // Save the merged PDF
        const mergedPdfBytes = await mergedPdf.save();
        const mergedPdfBase64 = Buffer.from(mergedPdfBytes).toString('base64');
        fs.writeFileSync(outputPath, mergedPdfBase64, { encoding: 'base64' });
        return {
            content: [
                {
                    type: "text",
                    text: `Successfully merged ${pdfPaths.length} PDFs into ${outputPath}`,
                },
            ],
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error merging PDFs: ${errorMessage}`,
                },
            ],
        };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("PDF MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
