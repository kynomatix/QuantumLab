import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center h-96">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-6 w-6 text-trading-loss" />
            <h1 className="text-lg font-semibold">Page Not Found</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            The page you're looking for doesn't exist.
          </p>
          <Link href="/">
            <Button variant="secondary" size="sm" data-testid="button-back-home">
              <ArrowLeft className="w-3 h-3 mr-1" /> Back to Setup
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
