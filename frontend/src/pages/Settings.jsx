import React from 'react';
import { Page, Card, Text, BlockStack, Badge, InlineStack, Button } from '@shopify/polaris';

export default function Settings() {
  return (
    <Page
      title="Settings"
      subtitle="Manage your TaxEase UK integrations"
      backAction={{ content: 'Dashboard', url: '/dashboard' }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">Integrations</Text>
            <InlineStack align="space-between">
              <Text>Shopify</Text>
              <Badge tone="success">Connected</Badge>
            </InlineStack>
            <InlineStack align="space-between">
              <Text>HMRC MTD</Text>
              <Badge tone="warning">Not connected</Badge>
            </InlineStack>
            <InlineStack align="space-between">
              <Text>Open Banking</Text>
              <Badge tone="warning">Not connected</Badge>
            </InlineStack>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">Subscription</Text>
            <Text>Current plan: <strong>Small Business — £19/mo</strong></Text>
            <Button>Manage Subscription</Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
