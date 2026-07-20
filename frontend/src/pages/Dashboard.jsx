import React, { useState, useEffect } from 'react';
import {
  Page, Layout, Card, Text, Badge, Button,
  BlockStack, InlineStack, Box, Divider
} from '@shopify/polaris';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_BASE}/api/dashboard/summary`, {
      params: { merchantId: 'demo' }
    })
      .then(res => setSummary(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Page
      title="TaxEase UK"
      subtitle="Your UK financial compliance dashboard"
      primaryAction={{ content: 'File VAT Return', url: '/vat' }}
    >
      <Layout>
        {/* VAT Status */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd">VAT Returns</Text>
                <Badge tone="warning">Due Soon</Badge>
              </InlineStack>
              <Text variant="heading2xl" as="p">£0.00</Text>
              <Text tone="subdued">VAT owed this quarter</Text>
              <Button url="/vat" variant="primary">View VAT Returns</Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Companies House */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd">Companies House</Text>
                <Badge tone="success">Up to date</Badge>
              </InlineStack>
              <Text variant="heading2xl" as="p">—</Text>
              <Text tone="subdued">Next filing deadline</Text>
              <Button url="/companies-house">Prepare Accounts</Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* P&L */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd">Profit & Loss</Text>
                <Badge>This Month</Badge>
              </InlineStack>
              <Text variant="heading2xl" as="p">£0.00</Text>
              <Text tone="subdued">Net profit (ex-VAT)</Text>
              <Button url="/bank">Connect Bank</Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Quick Actions */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Quick Actions</Text>
              <Divider />
              <InlineStack gap="300" wrap>
                <Button url="/vat" variant="primary">📤 Submit VAT Return</Button>
                <Button url="/companies-house">🏛️ File Annual Accounts</Button>
                <Button url="/bank">🏦 Connect Bank Account</Button>
                <Button url="/bank">📁 Upload Bank Statement</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
