import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Download, X, FileText, Image, FileSpreadsheet, File } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const DocumentPreviewModal = ({ isOpen, onClose, document, API_BASE_URL }) => {
  const [previewUrl, setPreviewUrl] = useState('');
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getFileExtension = (documentName, documentUrl) => {
    // First try to get extension from document_name
    const nameParts = documentName.split('.');
    if (nameParts.length > 1) {
      return nameParts[nameParts.length - 1].toLowerCase();
    }
    
    // If no extension in name, try to get from document_url
    if (documentUrl) {
      const urlParts = documentUrl.split('.');
      if (urlParts.length > 1) {
        return urlParts[urlParts.length - 1].toLowerCase();
      }
    }
    
    return '';
  };

  const getFileIcon = (documentName, documentUrl) => {
    const ext = getFileExtension(documentName, documentUrl);
    switch (ext) {
      case 'pdf':
        return <FileText className="h-6 w-6 text-red-500" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'svg':
      case 'webp':
        return <Image className="h-6 w-6 text-green-500" />;
      case 'xlsx':
      case 'xls':
      case 'csv':
        return <FileSpreadsheet className="h-6 w-6 text-green-600" />;
      case 'docx':
      case 'doc':
        return <FileText className="h-6 w-6 text-blue-500" />;
      case 'txt':
        return <FileText className="h-6 w-6 text-gray-500" />;
      default:
        return <File className="h-6 w-6 text-gray-400" />;
    }
  };

  const canPreview = (documentName, documentUrl) => {
    const ext = getFileExtension(documentName, documentUrl);
    const previewableExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'txt'];
    return previewableExtensions.includes(ext);
  };

  const isPdfFile = (documentName, documentUrl) => {
    return getFileExtension(documentName, documentUrl) === 'pdf';
  };

  const isImageFile = (documentName, documentUrl) => {
    const ext = getFileExtension(documentName, documentUrl);
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext);
  };

  const isTextFile = (documentName, documentUrl) => {
    return getFileExtension(documentName, documentUrl) === 'txt';
  };

  useEffect(() => {
    if (isOpen && document) {
      loadPreview();
    }
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isOpen, document]);

  const loadPreview = async () => {
    if (!document) return;

    setLoading(true);
    setError('');
    setPageNumber(1);

    try {
      const response = await fetch(`${API_BASE_URL}/documents/${document.id}/preview`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } else {
        throw new Error('Failed to load document');
      }
    } catch (err) {
      setError('Failed to load document preview');
      console.error('Error loading preview:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!document) return;

    try {
      const response = await fetch(`${API_BASE_URL}/documents/${document.id}/download/`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${document.document_name}.${getFileExtension(document.document_name)}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Error downloading document:", error);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const changePage = (offset) => {
    setPageNumber(prevPageNumber => prevPageNumber + offset);
  };

  const previousPage = () => {
    changePage(-1);
  };

  const nextPage = () => {
    changePage(1);
  };

  if (!document) return null;

  const fileExtension = getFileExtension(document.document_name, document.document_url);
  const canPreviewFile = canPreview(document.document_name, document.document_url);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center space-x-3">
            {getFileIcon(document.document_name, document.document_url)}
            <div>
              <DialogTitle className="text-lg font-semibold">
                {document.document_name}.{fileExtension}
              </DialogTitle>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {document.document_type}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {document.document_version}
                </Badge>
                <span className="text-xs text-muted-foreground uppercase">
                  {fileExtension}
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading preview...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <File className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Preview Not Available</h3>
                <p className="text-muted-foreground mb-4">{error}</p>
                <p className="text-sm text-muted-foreground mb-4">
                  This file type ({fileExtension.toUpperCase()}) cannot be previewed. Please download the file to view its contents.
                </p>
                <Button onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
            </div>
          ) : !canPreviewFile ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                {getFileIcon(document.document_name, document.document_url)}
                <h3 className="text-lg font-semibold mt-4 mb-2">Preview Not Available</h3>
                <p className="text-muted-foreground mb-4">
                  This file type ({fileExtension.toUpperCase()}) cannot be previewed in the browser.
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Please download the file to view its contents.
                </p>
                <Button onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {isPdfFile(document.document_name, document.document_url) && (
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={previousPage}
                      disabled={pageNumber <= 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {pageNumber} of {numPages || '?'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={nextPage}
                      disabled={pageNumber >= (numPages || 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-center">
                {isPdfFile(document.document_name, document.document_url) && (
                  <div className="border rounded-lg overflow-auto max-h-[60vh]">
                    <Document
                      file={previewUrl}
                      onLoadSuccess={onDocumentLoadSuccess}
                      loading={
                        <div className="flex items-center justify-center p-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                      }
                      error={
                        <div className="text-center p-8">
                          <p className="text-muted-foreground">Failed to load PDF</p>
                        </div>
                      }
                    >
                      <Page pageNumber={pageNumber} />
                    </Document>
                  </div>
                )}

                {isImageFile(document.document_name, document.document_url) && (
                  <div className="border rounded-lg overflow-auto max-h-[60vh]">
                    <img
                      src={previewUrl}
                      alt={document.document_name}
                      className="max-w-full h-auto"
                      onLoad={() => setLoading(false)}
                      onError={() => {
                        setError('Failed to load image');
                        setLoading(false);
                      }}
                    />
                  </div>
                )}

                {isTextFile(document.document_name, document.document_url) && (
                  <div className="border rounded-lg p-4 max-h-[60vh] overflow-auto bg-muted/50">
                    <iframe
                      src={previewUrl}
                      className="w-full h-full min-h-[400px] border-0 bg-white"
                      title="Text File Preview"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentPreviewModal;
