import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Preview,
    Section,
    Text,
} from '@react-email/components';

interface VerificationEmailProps {
    url: string;
}

export const VerificationEmail = ({ url }: VerificationEmailProps) => {
    return (
        <Html>
            <Head />
            <Preview>Verify your email address for MTMS</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={h1}>Verifikasi Email Anda</Heading>
                    <Text style={text}>
                        Halo, terima kasih telah mendaftar di MTMS (Monitoring Transaction
                        Material's System). Untuk menyelesaikan pendaftaran Anda dan memverifikasi
                        alamat email ini, silakan klik tombol di bawah.
                    </Text>
                    <Section style={buttonContainer}>
                        <Button style={button} href={url}>
                            Verifikasi Email
                        </Button>
                    </Section>
                    <Text style={text}>
                        Atau, Anda dapat menyalin tautan berikut ke browser Anda:
                        <br />
                        <a href={url} style={link}>
                            {url}
                        </a>
                    </Text>
                    <Hr style={hr} />
                    <Text style={footer}>Abaikan email ini jika Anda tidak mendaftar di MTMS.</Text>
                </Container>
            </Body>
        </Html>
    );
};

export default VerificationEmail;

const main = {
    backgroundColor: '#f6f9fc',
    fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '20px 0 48px',
    marginBottom: '64px',
};

const h1 = {
    color: '#333',
    fontSize: '24px',
    fontWeight: '600',
    lineHeight: '40px',
    margin: '0 0 20px',
    padding: '0 48px',
};

const text = {
    color: '#333',
    fontSize: '16px',
    lineHeight: '26px',
    padding: '0 48px',
};

const buttonContainer = {
    padding: '27px 48px 27px',
};

const button = {
    backgroundColor: '#0052cc',
    borderRadius: '3px',
    color: '#fff',
    fontSize: '16px',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'block',
    padding: '12px',
};

const link = {
    color: '#0052cc',
    textDecoration: 'underline',
};

const hr = {
    borderColor: '#cccccc',
    margin: '20px 0',
};

const footer = {
    color: '#8898aa',
    fontSize: '12px',
    padding: '0 48px',
};
