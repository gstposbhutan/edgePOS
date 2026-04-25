import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glassmorphism border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">🏔️</span>
              </div>
              <div>
                <h1 className="text-xl font-serif font-bold text-foreground">NEXUS BHUTAN</h1>
                <p className="text-sm text-muted-foreground">4K Edge-AI POS System</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="border-emerald-500 text-emerald-600" render="span">
                ● System Online
              </Badge>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground">NB</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-serif font-bold text-foreground mb-2">
            Welcome to NEXUS BHUTAN
          </h2>
          <p className="text-muted-foreground">
            Royal Bhutan's 4K Edge-AI POS & Multi-Tier Supply Chain Ecosystem for GST 2026 Compliance
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* AI Vision Card */}
          <Card className="glassmorphism">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-lg">👁️ 4K Vision AI</CardTitle>
                <Badge className="bg-primary">YOLO26</Badge>
              </div>
              <CardDescription>
                Real-time product recognition with zero keyboard interface
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground">Detection Accuracy</span>
                    <span className="text-primary font-medium">99.9%</span>
                  </div>
                  <Progress value={99.9} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground">Inference Speed</span>
                    <span className="text-emerald-600 font-medium">95ms</span>
                  </div>
                  <Progress value={95} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* GST Compliance Card */}
          <Card className="glassmorphism">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-lg">🧾 GST 2026</CardTitle>
                <Badge className="bg-secondary">Compliant</Badge>
              </div>
              <CardDescription>
                5% flat rate with Input Tax Credit tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tax Rate</span>
                  <span className="text-foreground font-medium">5% Flat</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">ITC Tracking</span>
                  <span className="text-emerald-600 font-medium">✓ Enabled</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Digital Signatures</span>
                  <span className="text-emerald-600 font-medium">✓ SHA-256</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Offline-First Card */}
          <Card className="glassmorphism">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-lg">📱 Offline-First</CardTitle>
                <Badge variant="outline" className="border-primary text-primary">PouchDB</Badge>
              </div>
              <CardDescription>
                Uninterrupted operations in rural Bhutan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Local Storage</span>
                  <span className="text-foreground font-medium">IndexedDB</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Sync Status</span>
                  <span className="text-emerald-600 font-medium">✓ Connected</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Conflict Resolution</span>
                  <span className="text-emerald-600 font-medium">✓ CRDT</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Demo Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Component Demo */}
          <Card>
            <CardHeader>
              <CardTitle>UI Components Demo</CardTitle>
              <CardDescription>Royal Bhutan Theme Applied</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button className="bg-primary hover:bg-primary/90">Primary (Gold)</Button>
                <Button variant="secondary" className="bg-secondary hover:bg-secondary/90">Secondary (Emerald)</Button>
                <Button variant="outline" className="border-primary text-primary">Outline</Button>
                <Button variant="destructive">Destructive (Red)</Button>
              </div>

              {/* Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Product Search</label>
                <Input
                  placeholder="Scan or search products..."
                  className="border-border focus:ring-primary"
                />
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge className="bg-primary">Primary</Badge>
                <Badge className="bg-secondary">Secondary</Badge>
                <Badge variant="outline" className="border-primary text-primary">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Sample Data Table */}
          <Card>
            <CardHeader>
              <CardTitle>Sample Transaction Data</CardTitle>
              <CardDescription>Demonstrating Table Component</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>GST (5%)</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">SHOP-2026-001</TableCell>
                    <TableCell>Nu. 450</TableCell>
                    <TableCell>Nu. 22.50</TableCell>
                    <TableCell><Badge className="bg-secondary">Paid</Badge></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">SHOP-2026-002</TableCell>
                    <TableCell>Nu. 890</TableCell>
                    <TableCell>Nu. 44.50</TableCell>
                    <TableCell><Badge className="bg-secondary">Paid</Badge></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">SHOP-2026-003</TableCell>
                    <TableCell>Nu. 1,250</TableCell>
                    <TableCell>Nu. 62.50</TableCell>
                    <TableCell><Badge variant="outline">Pending</Badge></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Interactive Dialog Demo */}
        <div className="mt-6">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="lg" className="w-full bg-primary hover:bg-primary/90">
                🏔️ Explore NEXUS BHUTAN Features
              </Button>
            </DialogTrigger>
            <DialogContent className="glassmorphism">
              <DialogHeader>
                <DialogTitle className="text-xl font-serif">NEXUS BHUTAN Ecosystem</DialogTitle>
                <DialogDescription>
                  Comprehensive POS and Supply Chain Management for Bhutan 2026
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border border-border rounded-lg">
                    <h4 className="font-medium text-foreground mb-2">🎯 Core Features</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• 4K Vision AI Recognition</li>
                      <li>• Zero Keyboard Interface</li>
                      <li>• Face-ID Authentication</li>
                      <li>• WhatsApp PDF Receipts</li>
                    </ul>
                  </div>
                  <div className="p-4 border border-border rounded-lg">
                    <h4 className="font-medium text-foreground mb-2">📊 Business Tools</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Inventory Management</li>
                      <li>• Credit Limit Control</li>
                      <li>• GST Report Generation</li>
                      <li>• Supply Chain Tracking</li>
                    </ul>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-primary/10 border border-primary/20 rounded-lg">
                  <div>
                    <h4 className="font-medium text-foreground">GST 2026 Compliant</h4>
                    <p className="text-sm text-muted-foreground">Automated tax filing & ITC tracking</p>
                  </div>
                  <Badge className="bg-primary text-lg px-3 py-1">5%</Badge>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Tech Stack Section */}
        <div className="mt-8 p-6 glassmorphism border border-border rounded-lg">
          <h3 className="text-lg font-serif font-bold text-foreground mb-4">🛠️ Technology Stack</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Frontend:</span>
              <p className="text-foreground font-medium">Next.js 15 + TypeScript</p>
            </div>
            <div>
              <span className="text-muted-foreground">UI Components:</span>
              <p className="text-foreground font-medium">Shadcn/UI + Tailwind</p>
            </div>
            <div>
              <span className="text-muted-foreground">Database:</span>
              <p className="text-foreground font-medium">Supabase + pgvector</p>
            </div>
            <div>
              <span className="text-muted-foreground">AI/ML:</span>
              <p className="text-foreground font-medium">YOLO26 + MobileNet</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © 2026 NEXUS BHUTAN. Built for Bhutan's Digital Transformation.
            </p>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                ✓ GST 2026 Compliant
              </Badge>
              <Badge variant="outline" className="border-primary text-primary">
                ✓ Made with ❤️ in Bhutan
              </Badge>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}